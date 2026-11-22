import { TwitterStrategy, LinkedInStrategy } from "@humanwhocodes/crosspost";
import { measureBody } from "../limits.ts";
import { HttpError } from "../types.ts";
import type { Ctx, Destination } from "../types.ts";
import { META } from "./meta.ts";
import { xIntent, linkedinShare } from "./handoffs.ts";

type Strategy = { post(text: string, options: { signal: AbortSignal }): Promise<unknown>; getUrlFromResponse(response: never): string };
// Each Crosspost strategy pairs its own response type with its URL extractor.
export let strategyFactory: (id: "x" | "linkedin", ctx: Ctx) => Strategy = (id, ctx) => (id === "x"
  ? new TwitterStrategy({ accessTokenKey: ctx.env.X_ACCESS_TOKEN!, accessTokenSecret: ctx.env.X_ACCESS_SECRET!, apiConsumerKey: ctx.env.X_API_KEY!, apiConsumerSecret: ctx.env.X_API_SECRET! })
  : new LinkedInStrategy({ accessToken: ctx.env.LINKEDIN_ACCESS_TOKEN! })) as unknown as Strategy;

export function setStrategyFactory(factory: typeof strategyFactory) { strategyFactory = factory; }

async function create(id: "x" | "linkedin", text: string, ctx: Ctx) {
  const strategy = strategyFactory(id, ctx);
  // Crosspost owns its networking; it does not accept an injected fetch.
  const response = await strategy.post(text, { signal: AbortSignal.timeout(ctx.timeoutMs) });
  const result = response as { data?: { id?: string }; id?: string };
  return { id: String(result.data?.id ?? result.id), url: strategy.getUrlFromResponse(response as never) };
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
    const url = post.body.match(/https?:\/\/[^\s)>\]]+/)?.[0];
    return url ? { url: linkedinShare(url), prefills: "link" } : { prefills: "none" };
  },
  async verify(ctx) {
    const response = await ctx.fetch("https://api.linkedin.com/v2/userinfo", { headers: { authorization: `Bearer ${ctx.env.LINKEDIN_ACCESS_TOKEN ?? ""}` }, signal: AbortSignal.timeout(ctx.timeoutMs) });
    if (!response.ok) {
      const text = (await response.text()).slice(0, 200);
      const safe = Object.values(ctx.env).reduce<string>((s, v) => v ? s.split(v).join("***") : s, text);
      throw new HttpError(response.status, `linkedin ${response.status}: ${safe}`);
    }
  },
};
