import type { Ctx, Destination, ResolvedPost } from "../types.ts";
import { UserError } from "../types.ts";
import { requestJson } from "./http.ts";

function payload(post: ResolvedPost, ctx: Ctx, stage = false) {
  const tags = post.tags ?? ctx.config.devto.tags ?? [];
  if (tags.length > 4 || tags.some((tag) => !/^[a-z0-9]+$/.test(tag))) {
    throw new UserError("devto tags must be lowercase alphanumeric and at most four");
  }
  return { article: {
    title: post.title, body_markdown: post.body, published: !stage && ctx.config.devto.publish === true,
    tags, canonical_url: post.canonical,
  } };
}
async function request(ctx: Ctx, path: string, method: string, body?: unknown) {
  return requestJson<{ id: string | number; url: string }>(ctx, "devto", `https://dev.to/api${path}`, {
    method, headers: {
      "api-key": ctx.env.DEV_API_KEY ?? "", accept: "application/vnd.forem.api-v1+json",
      "content-type": "application/json",
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
export const devto: Destination = {
  id: "devto", kind: "article", env: ["DEV_API_KEY"], limit: () => null,
  payload: (post, ctx, opts) => payload(post, ctx, opts?.stage),
  async verify(ctx) { await request(ctx, "/users/me", "GET"); },
  async create(post, ctx, opts) {
    const body = payload(post, ctx, opts.stage);
    const result = await request(ctx, "/articles", "POST", body);
    return { id: String(result.id), url: result.url, ...(!body.article.published ? { staged: true } : {}) };
  },
  async update(id, post, ctx, opts) {
    const body = payload(post, ctx, opts.stage);
    body.article.published = !opts.stage;
    const result = await request(ctx, `/articles/${encodeURIComponent(id)}`, "PUT", body);
    return { id: String(result.id), url: result.url, ...(!body.article.published ? { staged: true } : {}) };
  },
};
