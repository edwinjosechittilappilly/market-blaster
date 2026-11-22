import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, extname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { measureBody } from "../limits.ts";
import { HttpError, MediaUploadError } from "../types.ts";
import type { Ctx, Destination } from "../types.ts";
import { META } from "./meta.ts";
import { requestJson, uploadTimeout } from "./http.ts";

interface MastodonResponse {
  id?: string; url?: string | null; error?: string;
  max_toot_chars?: number;
  configuration?: {
    statuses?: { max_characters?: number; max_media_attachments?: number };
    media_attachments?: {
      supported_mime_types?: string[]; image_size_limit?: number; video_size_limit?: number;
      description_limit?: number;
    };
  };
}

async function request(ctx: Ctx, path: string, init: RequestInit = {}): Promise<MastodonResponse> {
  const host = ctx.env.MASTODON_HOST || ctx.config.mastodon.host;
  return requestJson(ctx, "mastodon", `https://${host}${path}`, {
    ...init, headers: { authorization: `Bearer ${ctx.env.MASTODON_TOKEN ?? ""}`, ...init.headers },
  });
}

const mimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".heic": "image/heic", ".heif": "image/heif",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/x-m4v",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4",
};

function mimeType(path: string): string {
  return mimeTypes[extname(path).toLowerCase()] ?? "application/octet-stream";
}

async function instanceInfo(ctx: Ctx): Promise<MastodonResponse> {
  try { return await request(ctx, "/api/v2/instance"); }
  catch (err) {
    if (!(err instanceof HttpError) || err.status !== 404) throw err;
    return request(ctx, "/api/v1/instance");
  }
}

async function uploadMedia(media: NonNullable<Parameters<NonNullable<Destination["create"]>>[0]["media"]>[number], ctx: Ctx): Promise<string> {
  const form = new FormData();
  const bytes = media.data ?? await readFile(media.path);
  form.set("file", new Blob([bytes], { type: mimeType(media.path) }), basename(media.path));
  form.set("description", media.alt);
  let result = await request(ctx, "/api/v2/media", {
    method: "POST", body: form, signal: AbortSignal.timeout(uploadTimeout(bytes.length)),
  });
  if (!result.id) throw new Error("mastodon: media upload returned no id");
  const id = result.id;
  const now = ctx.now ?? Date.now;
  const deadline = now() + (ctx.config.mastodon.processingTimeoutMs ?? 600_000);
  let interval = 1000;
  while (!result.url) {
    if (result.error) throw new Error(`mastodon: media processing failed: ${result.error}`);
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await (ctx.sleep ?? delay)(Math.min(interval, remaining));
    interval = Math.min(interval * 2, 10_000);
    const requestTime = deadline - now();
    if (requestTime <= 0) break;
    result = await request(ctx, `/api/v1/media/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(Math.min(ctx.timeoutMs, requestTime)),
    });
  }
  if (result.error) throw new Error(`mastodon: media processing failed: ${result.error}`);
  if (!result.url) throw new Error("mastodon: media processing did not finish");
  return id;
}

export const mastodon: Destination = {
  id: "mastodon", kind: "social", env: META.mastodon.env,
  limit: (text, ctx) => measureBody("mastodon", text, ctx.config),
  payload: (post) => new URLSearchParams({ status: post.body, visibility: "public" }).toString(),
  async verify(ctx) {
    await request(ctx, "/api/v1/accounts/verify_credentials");
    const instance = await instanceInfo(ctx);
    const max = instance.configuration?.statuses?.max_characters ?? instance.max_toot_chars;
    if (typeof max === "number" && max > 0) ctx.config.mastodon.maxChars = max;
  },
  async preflight(post, ctx) {
    if (!post.media?.length) return;
    const instance = await instanceInfo(ctx);
    const limits = instance.configuration?.media_attachments;
    const maxAttachments = instance.configuration?.statuses?.max_media_attachments
      ?? ctx.config.mastodon.maxMediaAttachments ?? 4;
    if (post.media.length > maxAttachments)
      throw new Error(`mastodon: ${post.media.length} attachments exceeds instance limit ${maxAttachments}`);
    if (post.media.length > 1 && post.media.some((media) => media.kind === "video"))
      throw new Error("mastodon: a video cannot be combined with other attachments");
    for (const media of post.media) {
      const mime = mimeType(media.path);
      if (!["image", "gif", "video"].includes(media.kind)
        || !(media.kind === "video" ? mime.startsWith("video/") : mime.startsWith("image/")))
        throw new Error(`mastodon: ${media.path}: unsupported media type ${mime}`);
      if (limits?.supported_mime_types && !limits.supported_mime_types.includes(mime))
        throw new Error(`mastodon: ${media.path}: unsupported media type ${mime}`);
      let size = media.data?.length;
      if (size === undefined) {
        await access(media.path, constants.R_OK);
        const info = await stat(media.path);
        if (!info.isFile()) throw new Error(`mastodon: ${media.path}: not a file`);
        size = info.size;
      }
      const max = mime.startsWith("image/")
        ? limits?.image_size_limit ?? ctx.config.mastodon.imageSizeLimit
        : limits?.video_size_limit ?? ctx.config.mastodon.videoSizeLimit;
      if (typeof max === "number" && size > max)
        throw new Error(`mastodon: ${media.path}: ${size} bytes exceeds instance limit ${max}`);
      if (typeof limits?.description_limit === "number" && [...media.alt].length > limits.description_limit)
        throw new Error(`mastodon: ${media.path}: description exceeds instance limit ${limits.description_limit}`);
    }
  },
  async create(post, ctx) {
    const mediaIds: string[] = [];
    try {
      for (const media of post.media ?? []) mediaIds.push(await uploadMedia(media, ctx));
    } catch (cause) {
      throw new MediaUploadError(cause);
    }
    const body = new URLSearchParams({ status: post.body, visibility: "public" });
    for (const id of mediaIds) body.append("media_ids[]", id);
    const data = await request(ctx, "/api/v1/statuses", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "idempotency-key": post.contentHash },
      body: body.toString(),
    });
    return { id: String(data.id), url: data.url ?? "" };
  },
};
