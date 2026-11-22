import { TwitterStrategy, LinkedInStrategy } from "@humanwhocodes/crosspost";
import { measureBody, URL_RE } from "../limits.ts";
import { HttpError } from "../types.ts";
import type { Ctx, Destination } from "../types.ts";
import { META } from "./meta.ts";
import { xIntent, linkedinShare } from "./handoffs.ts";
import { requestJson, redactAdapter } from "./http.ts";

type Strategy = NonNullable<Ctx["crosspost"]> extends (...args: never[]) => infer S ? S : never;
function strategy(id: "x" | "linkedin", ctx: Ctx): Strategy {
  return ctx.crosspost ? ctx.crosspost(id, ctx.env) : (id === "x"
    ? new TwitterStrategy({ accessTokenKey: ctx.env.X_ACCESS_TOKEN!, accessTokenSecret: ctx.env.X_ACCESS_SECRET!, apiConsumerKey: ctx.env.X_API_KEY!, apiConsumerSecret: ctx.env.X_API_SECRET! })
    : new LinkedInStrategy({ accessToken: ctx.env.LINKEDIN_ACCESS_TOKEN! })) as unknown as Strategy;
}

async function create(id: "x" | "linkedin", text: string, ctx: Ctx) {
  const client = strategy(id, ctx);
  const { promise: timeout, reject } = Promise.withResolvers<never>();
  const timer = setTimeout(() => reject(new DOMException("Crosspost timed out", "TimeoutError")), ctx.timeoutMs);
  try {
    const response = await Promise.race([client.post(text, { signal: AbortSignal.timeout(ctx.timeoutMs) }), timeout]);
    const result = response as { data?: { id?: string }; id?: string };
    return { id: String(result.data?.id ?? result.id), url: client.getUrlFromResponse(response as never) };
  } catch (error) {
    const e = error as { code?: unknown; requestError?: unknown; message?: string };
    if (typeof e.code === "number" && e.code >= 100 && e.code <= 599) throw new HttpError(e.code, `${id} ${e.code}: ${redactAdapter(e.message ?? "", ctx, id)}`);
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

export const linkedin: Destination = {
  id: "linkedin", kind: "social", env: META.linkedin.env,
  limit: (text, ctx) => measureBody("linkedin", text, ctx.config),
  apiEnabled: (config) => config.linkedin.api === true,
  payload: (post) => ({ text: post.body }),
  create: (post, ctx) => create("linkedin", post.body, ctx),
  handoff: (post) => {
    const url = post.body.match(URL_RE)?.[0];
    return url ? { url: linkedinShare(url), prefills: "link" } : { prefills: "none" };
  },
  async verify(ctx) {
    await requestJson(ctx, "linkedin", "https://api.linkedin.com/v2/userinfo", { headers: { authorization: `Bearer ${ctx.env.LINKEDIN_ACCESS_TOKEN ?? ""}` } });
  },
};
