import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { imageSize } from "image-size";
import { HttpError, MediaUploadError, UserError } from "../types.ts";
import { measureBody, URL_RE } from "../limits.ts";
import type { Ctx, Destination, ResolvedPost } from "../types.ts";
import { META } from "./meta.ts";
import { redactAdapter, requestJson, uploadTimeout } from "./http.ts";

const execFileAsync = promisify(execFile);
type BlobRef = { $type: string; ref: unknown; mimeType: string; size: number };
type Auth = { did: string; accessJwt: string; didDoc?: { service?: { id: string; serviceEndpoint: string }[] } };
type Media = NonNullable<ResolvedPost["media"]>[number];
type Job = { jobId: string; state: string; blob?: BlobRef; error?: string; message?: string };
type Dimensions = { width: number; height: number };
const dimensionsCache = new WeakMap<Ctx, Map<string, { signature: string; data?: Buffer; dimensions: Dimensions }>>();

function host(ctx: Ctx) {
  return `https://${ctx.env.BLUESKY_HOST || ctx.config.bluesky.host || "bsky.social"}`;
}

function pds(auth: Auth, ctx: Ctx) {
  return auth.didDoc?.service?.find((service) => service.id.endsWith("#atproto_pds"))?.serviceEndpoint ?? host(ctx);
}

async function request<T>(ctx: Ctx, base: string, path: string, body: unknown, token?: string): Promise<T> {
  return requestJson(ctx, "bluesky", `${base}/xrpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function session(ctx: Ctx) {
  return request<Auth>(ctx, host(ctx), "com.atproto.server.createSession", {
    identifier: ctx.env.BLUESKY_IDENTIFIER, password: ctx.env.BLUESKY_APP_PASSWORD,
  });
}

function record(post: ResolvedPost, ctx: Ctx, mediaEmbed?: unknown) {
  const encoder = new TextEncoder();
  const matches = [...post.body.matchAll(URL_RE)];
  const facets = matches.map((match) => ({
    index: {
      byteStart: encoder.encode(post.body.slice(0, match.index)).length,
      byteEnd: encoder.encode(post.body.slice(0, match.index + match[0].length)).length,
    },
    features: [{ $type: "app.bsky.richtext.facet#link", uri: match[0] }],
  }));
  return {
    $type: "app.bsky.feed.post", text: post.body, createdAt: new Date().toISOString(),
    langs: ctx.config.bluesky.langs ?? ["en"], facets,
    ...(mediaEmbed ? { embed: mediaEmbed } : matches.length ? { embed: { $type: "app.bsky.embed.external", external: {
      uri: matches[0][0], title: post.title || post.body.split("\n")[0],
      description: (post.body.split(/\n\s*\n/)[1] ?? "").trim().slice(0, 300),
    } } } : {}),
  };
}

function mime(path: string): string {
  const types: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".vtt": "text/vtt" };
  return types[extname(path).toLowerCase()] ?? "";
}

async function preflight(post: ResolvedPost, ctx: Ctx) {
  const media = post.media ?? [];
  const images = media.filter((item) => item.kind === "image");
  const videos = media.filter((item) => item.kind === "video");
  const captions = media.filter((item) => item.kind === "vtt" || item.kind === "caption");
  if (images.length > 4 || videos.length > 1 || (images.length && videos.length) || (captions.length && !videos.length) || media.length !== images.length + videos.length + captions.length) {
    throw new UserError("bluesky: use up to four images or one video with captions");
  }
  for (const item of media) {
    const info = await stat(item.path);
    const size = item.data?.length ?? info.size;
    if (item.kind === "image" && size > 2_000_000) throw new UserError(`bluesky: image exceeds 2 MB: ${item.path}`);
    if (item.kind === "video" && size > 300_000_000) throw new UserError(`bluesky: video exceeds 300 MB: ${item.path}`);
    if ((item.kind === "vtt" || item.kind === "caption") && size > 20_000) throw new UserError(`bluesky: caption exceeds 20 KB: ${item.path}`);
    if (/\.gif$/i.test(item.path)) throw new UserError("bluesky: GIF attachments are unsupported; export MP4 instead");
    if (!mime(item.path) || (item.kind === "image" && !mime(item.path).startsWith("image/")) || (item.kind === "video" && mime(item.path) !== "video/mp4") || ((item.kind === "vtt" || item.kind === "caption") && mime(item.path) !== "text/vtt")) {
      throw new UserError(`bluesky: unsupported media type: ${item.path}`);
    }
    if (item.kind === "image" || item.kind === "video") {
      const signature = `${item.kind}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
      let cache = dimensionsCache.get(ctx);
      if (!cache) dimensionsCache.set(ctx, cache = new Map());
      const cached = cache.get(item.path);
      if (cached?.signature !== signature || cached.data !== item.data) {
        let dimensions: Partial<Dimensions> | undefined;
        if (item.kind === "image") {
          dimensions = imageSize(item.data ?? await readFile(item.path));
        } else {
          const run = ctx.run ?? (async (cmd: string, args: string[]) => (await execFileAsync(cmd, args)).stdout);
          const probe = JSON.parse(await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", item.path])) as { streams?: Dimensions[] };
          dimensions = probe.streams?.[0];
        }
        if (!dimensions?.width || !dimensions.height) throw new UserError(`bluesky: unable to determine media dimensions: ${item.path}`);
        cache.set(item.path, { signature, data: item.data, dimensions: { width: dimensions.width, height: dimensions.height } });
      }
    }
  }
}

async function uploadBlob(ctx: Ctx, auth: Auth, item: Media): Promise<BlobRef> {
  const bytes = item.data ?? await readFile(item.path);
  const result = await requestJson<{ blob: BlobRef }>(ctx, "bluesky", `${pds(auth, ctx)}/xrpc/com.atproto.repo.uploadBlob`, {
    method: "POST", headers: { authorization: `Bearer ${auth.accessJwt}`, "content-type": mime(item.path) }, body: bytes,
    signal: AbortSignal.timeout(uploadTimeout(bytes.length)),
  });
  return result.blob;
}

async function videoBlob(ctx: Ctx, auth: Auth, item: Media): Promise<BlobRef> {
  const params = new URLSearchParams({ aud: `did:web:${new URL(pds(auth, ctx)).host.replaceAll(":", "%3A")}`, lxm: "com.atproto.repo.uploadBlob", exp: String(Math.floor(Date.now() / 1000) + 1800) });
  const service = await requestJson<{ token: string }>(ctx, "bluesky", `${pds(auth, ctx)}/xrpc/com.atproto.server.getServiceAuth?${params}`, { headers: { authorization: `Bearer ${auth.accessJwt}` } });
  const bytes = item.data ?? await readFile(item.path);
  const query = new URLSearchParams({ did: auth.did, name: basename(item.path) });
  const response = await ctx.fetch(`https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?${query}`, {
    method: "POST", headers: { authorization: `Bearer ${service.token}`, "content-type": "video/mp4", "content-length": String(bytes.length) }, body: bytes,
    redirect: "manual", signal: AbortSignal.timeout(uploadTimeout(bytes.length)),
  });
  const text = await response.text();
  let job: Job;
  try {
    job = JSON.parse(text) as Job;
  } catch (cause) {
    if (response.ok && response.type !== "opaqueredirect") throw new Error("bluesky: could not parse successful response", { cause });
    job = {} as Job;
  }
  if (!response.ok || response.type === "opaqueredirect") {
    if (job.error === "already_exists" && (job.blob || job.jobId)) {
      job = { ...job, error: undefined };
    } else {
      const error = new HttpError(response.status, `bluesky ${response.status}: ${redactAdapter(text.slice(0, 200), ctx, "bluesky")}`);
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) Object.assign(error, { retryAfter });
      throw error;
    }
  }
  const deadline = Date.now() + 10 * 60_000;
  let firstPoll = true;
  while (!job.blob) {
    if (job.error || job.state === "JOB_STATE_FAILED") throw new Error(`bluesky video processing failed: ${job.message || job.error || job.state}`);
    if (!job.jobId || Date.now() >= deadline) throw new Error("bluesky video processing did not complete");
    if (!firstPoll) await delay(1000);
    firstPoll = false;
    const status = await requestJson<{ jobStatus: Job }>(ctx, "bluesky", `https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?${new URLSearchParams({ jobId: job.jobId })}`);
    job = status.jobStatus;
  }
  return job.blob;
}

async function mediaEmbed(post: ResolvedPost, ctx: Ctx, auth: Auth): Promise<unknown> {
  const media = post.media ?? [];
  if (!media.length) return undefined;
  try {
    const images = media.filter((item) => item.kind === "image");
    if (images.length) {
      const entries = [];
      for (const image of images) {
        const dimensions = dimensionsCache.get(ctx)!.get(image.path)!.dimensions;
        entries.push({ alt: image.alt, image: await uploadBlob(ctx, auth, image), ...(dimensions.width && dimensions.height ? { aspectRatio: { width: dimensions.width, height: dimensions.height } } : {}) });
      }
      return { $type: "app.bsky.embed.images", images: entries };
    }
    const video = media.find((item) => item.kind === "video")!;
    const dimensions = dimensionsCache.get(ctx)!.get(video.path)!.dimensions;
    const blob = await videoBlob(ctx, auth, video);
    const captions = [];
    for (const caption of media.filter((item) => item.kind === "vtt" || item.kind === "caption")) {
      captions.push({ lang: caption.lang ?? ctx.config.bluesky.langs?.[0] ?? "en", file: await uploadBlob(ctx, auth, caption) });
    }
    return { $type: "app.bsky.embed.video", video: blob, alt: video.alt, aspectRatio: { width: dimensions.width, height: dimensions.height }, ...(captions.length ? { captions } : {}) };
  } catch (cause) {
    throw new MediaUploadError(cause);
  }
}

export const bluesky: Destination = {
  id: "bluesky", kind: "social", env: META.bluesky.env,
  limit: (text, ctx) => measureBody("bluesky", text, ctx.config),
  payload: (post, ctx) => ({ collection: "app.bsky.feed.post", record: record(post, ctx) }),
  preflight,
  async verify(ctx) { await session(ctx); },
  async create(post, ctx) {
    await preflight(post, ctx);
    const auth = await session(ctx);
    const embed = await mediaEmbed(post, ctx, auth);
    const data = await request<{ uri: string }>(ctx, pds(auth, ctx), "com.atproto.repo.createRecord", {
      repo: auth.did, collection: "app.bsky.feed.post", record: record(post, ctx, embed),
    }, auth.accessJwt);
    const rkey = data.uri.split("/").at(-1);
    return { id: data.uri, url: `https://bsky.app/profile/${auth.did}/post/${rkey}` };
  },
};
