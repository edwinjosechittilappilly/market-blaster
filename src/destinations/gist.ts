import { HttpError, type Ctx, type Destination, type ResolvedPost } from "../types.ts";

function payload(post: ResolvedPost, ctx: Ctx) {
  const slug = (post.title ?? "post").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "post";
  return { description: post.title, public: ctx.config.gist.public !== false, files: { [`${slug}.md`]: { content: post.body } } };
}
async function request(ctx: Ctx, path: string, method: string, body?: unknown) {
  const response = await ctx.fetch(`https://api.github.com${path}`, { method, headers: { authorization: `Bearer ${ctx.env.GITHUB_TOKEN ?? ""}`, accept: "application/vnd.github+json", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(ctx.timeoutMs) });
  if (!response.ok) throw new HttpError(response.status, `gist ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json() as Promise<{ id: string; html_url: string }>;
}
export const gist: Destination = {
  id: "gist", kind: "article", env: ["GITHUB_TOKEN"], limit: () => null, payload,
  async verify(ctx) { await request(ctx, "/user", "GET"); },
  async create(post, ctx) { const result = await request(ctx, "/gists", "POST", payload(post, ctx)); return { id: String(result.id), url: result.html_url }; },
  async update(id, post, ctx) { const result = await request(ctx, `/gists/${encodeURIComponent(id)}`, "PATCH", payload(post, ctx)); return { id: String(result.id), url: result.html_url }; },
};
