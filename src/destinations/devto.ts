import { HttpError, type Ctx, type Destination, type ResolvedPost } from "../types.ts";

function payload(post: ResolvedPost, ctx: Ctx, stage = false) {
  return { article: { title: post.title, body_markdown: post.body, published: !stage && ctx.config.devto.publish === true, tags: (post.tags ?? ctx.config.devto.tags ?? []).slice(0, 4), canonical_url: post.canonical } };
}
async function request(ctx: Ctx, path: string, method: string, body?: unknown) {
  const response = await ctx.fetch(`https://dev.to/api${path}`, { method, headers: { "api-key": ctx.env.DEV_API_KEY ?? "", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(ctx.timeoutMs) });
  if (!response.ok) throw new HttpError(response.status, `devto ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json() as Promise<{ id: string | number; url: string }>;
}
export const devto: Destination = {
  id: "devto", kind: "article", env: ["DEV_API_KEY"], limit: () => null,
  payload,
  async verify(ctx) { await request(ctx, "/users/me", "GET"); },
  async create(post, ctx, opts) { const result = await request(ctx, "/articles", "POST", payload(post, ctx, opts.stage)); return { id: String(result.id), url: result.url }; },
  async update(id, post, ctx, opts) { const result = await request(ctx, `/articles/${encodeURIComponent(id)}`, "PUT", payload(post, ctx, opts.stage)); return { id: String(result.id), url: result.url }; },
};
