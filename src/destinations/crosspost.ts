import { readFileSync } from "node:fs";
import { isPdf } from "../media.ts";
import { TwitterStrategy, LinkedInStrategy, NostrStrategy } from "@humanwhocodes/crosspost";
import { measureBody, URL_RE } from "../limits.ts";
import { HttpError, UserError } from "../types.ts";
import type { Ctx, Destination, ResolvedPost } from "../types.ts";
import { META } from "./meta.ts";
import { xIntent, linkedinShare } from "./handoffs.ts";
import { requestJson, redactAdapter, uploadTimeout } from "./http.ts";

type Strategy = NonNullable<Ctx["crosspost"]> extends (...args: never[]) => infer S ? S : never;
function strategy(id: "x" | "linkedin" | "nostr", ctx: Ctx): Strategy {
  return ctx.crosspost ? ctx.crosspost(id, ctx.env) : (id === "x"
    ? new TwitterStrategy({
      accessTokenKey: ctx.env.X_ACCESS_TOKEN!, accessTokenSecret: ctx.env.X_ACCESS_SECRET!,
      apiConsumerKey: ctx.env.X_API_KEY!, apiConsumerSecret: ctx.env.X_API_SECRET!,
    })
    : id === "nostr"
      ? new NostrStrategy({ privateKey: ctx.env.NOSTR_PRIVATE_KEY!, relays: ctx.config.nostr.relays })
      : new LinkedInStrategy({ accessToken: ctx.env.LINKEDIN_ACCESS_TOKEN! })) as unknown as Strategy;
}

async function create(id: "x" | "linkedin" | "nostr", text: string, ctx: Ctx, images?: { data: Uint8Array; alt: string }[]) {
  const client = strategy(id, ctx);
  const timeoutMs = images?.length ? uploadTimeout(images.reduce((total, image) => total + image.data.byteLength, 0)) : ctx.timeoutMs;
  const { promise: timeout, reject } = Promise.withResolvers<never>();
  const timer = setTimeout(() => reject(new DOMException("Crosspost timed out", "TimeoutError")), timeoutMs);
  try {
    const response = await Promise.race([client.post(text, { signal: AbortSignal.timeout(timeoutMs), ...(images?.length ? { images } : {}) }), timeout]);
    try {
      const result = response as { data?: { id?: string }; id?: string };
      const postId = result.data?.id ?? result.id;
      if (!postId) throw new Error("response has no post id");
      const note = id === "nostr" ? client.getUrlFromResponse?.(response as never)?.replace(/^nostr:/, "") : undefined;
      const url = id === "nostr"
        ? `https://njump.me/${note || postId}` : client.getUrlFromResponse?.(response as never) || "";
      return { id: String(postId), url };
    } catch (cause) {
      const error = new Error(`${id}: could not interpret successful response`, { cause });
      error.name = "UncertainResponseError";
      throw error;
    }
  } catch (error) {
    const e = error as { code?: unknown; requestError?: unknown; message?: string };
    if (typeof e.code === "number" && e.code >= 100 && e.code <= 599) {
      throw new HttpError(e.code, `${id} ${e.code}: ${redactAdapter(e.message ?? "", ctx, id)}`);
    }
    const status = id === "linkedin" && e.message?.match(/^(\d{3}) /);
    if (status) throw new HttpError(Number(status[1]), `${id} ${redactAdapter(e.message ?? "", ctx, id)}`);
    if (e.requestError) throw e.requestError;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const x: Destination = {
  id: "x", kind: "social", env: META.x.env,
  limit: (text, ctx) => measureBody("x", text, ctx.config),
  apiEnabled: (config) => config.x.api === true,
  payload: (post) => ({ text: post.body }),
  create: (post, ctx) => create("x", post.body, ctx),
  handoff: (post) => ({ url: xIntent(post.body), prefills: "full" }),
  cost: (post) => /https?:\/\//.test(post.body) ? 0.20 : 0.015,
};

function linkedinImages(post: ResolvedPost) {
  const media = post.media ?? [];
  if (media.length > 20) throw new UserError("linkedin supports at most twenty images");
  return media.map((item) => {
    if (item.kind !== "image" || isPdf(item)) {
      throw new UserError(`linkedin attachment ${item.path} requires manual handoff`);
    }
    return { data: item.data ?? readFileSync(item.path), alt: item.alt };
  });
}

export const linkedin: Destination = {
  id: "linkedin", kind: "social", env: META.linkedin.env,
  limit: (text, ctx) => measureBody("linkedin", text, ctx.config),
  apiEnabled: (config) => config.linkedin.api === true,
  payload: (post) => ({ text: post.body }),
  async preflight(post) { linkedinImages(post); },
  async create(post, ctx) { return create("linkedin", post.body, ctx, linkedinImages(post)); },
  handoff: (post) => {
    const url = post.body.match(URL_RE)?.[0];
    return url
      ? { url: linkedinShare(url), prefills: "link" }
      : { url: "https://www.linkedin.com/feed/?shareActive=true", prefills: "none" };
  },
  async verify(ctx) {
    await requestJson(ctx, "linkedin", "https://api.linkedin.com/v2/userinfo", {
      headers: { authorization: `Bearer ${ctx.env.LINKEDIN_ACCESS_TOKEN ?? ""}` },
    });
  },
};

export const nostr: Destination = {
  id: "nostr", kind: "social", env: META.nostr.env,
  limit: (text, ctx) => measureBody("nostr", text, ctx.config),
  payload: (post) => ({ text: post.body }),
  create: (post, ctx) => create("nostr", post.body, ctx),
};
