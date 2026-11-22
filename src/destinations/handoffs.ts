import type { Config, Ctx, Destination, DestinationId, HandoffInfo, NewsletterTarget, ResolvedPost } from "../types.ts";
import { measureBody } from "../limits.ts";

export const xIntent = (text: string): string => `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
export const linkedinShare = (url: string): string => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
function adapter(id: DestinationId, handoff: (post: ResolvedPost, ctx: Ctx) => HandoffInfo): Destination {
  return { id, kind: "handoff", env: [], limit: (text, ctx) => measureBody(id, text, ctx.config), payload: (post, ctx) => handoff(post, ctx), handoff };
}
export const hn = adapter("hn", (post) => ({ url: `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(post.canonical ?? "")}&t=${encodeURIComponent(post.title ?? "")}`, prefills: "link" }));
export const reddit = adapter("reddit", (post, ctx) => ({ url: `https://www.reddit.com/r/${encodeURIComponent(ctx.config.reddit.subreddit ?? "")}/submit?url=${encodeURIComponent(post.canonical ?? "")}&title=${encodeURIComponent(post.title ?? "")}`, prefills: "link" }));
export const threads = adapter("threads", (post) => ({ url: `https://www.threads.net/intent/post?text=${encodeURIComponent(post.body)}`, prefills: "full" }));
export const medium = adapter("medium", () => ({ url: "https://medium.com/p/import", prefills: "none" }));
export const producthunt = adapter("producthunt", () => ({ url: "https://www.producthunt.com/posts/new", prefills: "none" }));
export const substack = adapter("substack", (_post, ctx) => ({ url: ctx.config.substack.url ? `${ctx.config.substack.url.replace(/\/$/, "")}/publish/post` : undefined, prefills: "none" }));
export const lemmy = adapter("lemmy", (_post, ctx) => ({
  url: ctx.config.lemmy.instance && ctx.config.lemmy.community ? `https://${ctx.config.lemmy.instance}/c/${encodeURIComponent(ctx.config.lemmy.community)}` : undefined,
  prefills: "none",
}));

const NEWSLETTER_URLS: Record<NewsletterTarget, string> = {
  "console-dev": "https://console.dev/selection-criteria",
  "javascript-weekly": "https://cooperpress.com/submit/",
  "golang-weekly": "https://cooperpress.com/submit/",
  "changelog-news": "https://changelog.com/news/submit",
};
export function newsletterTargets(config: Config): { name: NewsletterTarget; url: string }[] {
  return config.newsletter.targets.map((name) => ({ name, url: NEWSLETTER_URLS[name] }));
}
export const newsletter = adapter("newsletter", (_post, ctx) => ({ url: newsletterTargets(ctx.config)[0]?.url, prefills: "none" }));
