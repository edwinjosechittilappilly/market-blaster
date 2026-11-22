import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { UserError } from "../types.ts";
import type { Ctx, Destination, ResolvedPost } from "../types.ts";
import { requestJson } from "./http.ts";

function payload(post: ResolvedPost, ctx: Ctx) {
  const files: Record<string, { content: string }> = { "README.md": { content: post.body } };
  for (const media of post.media ?? []) {
    const name = basename(media.path);
    const extension = extname(name).toLowerCase();
    if (extension !== ".svg" && media.kind !== "text") {
      throw new UserError(`gist attachment ${media.path}: only SVG and text are supported`);
    }
    if (Object.hasOwn(files, name)) throw new UserError(`gist attachment ${media.path}: duplicate filename`);
    const data = readFileSync(media.path);
    let content: string;
    try { content = new TextDecoder("utf-8", { fatal: true }).decode(data); }
    catch { throw new UserError(`gist attachment ${media.path}: invalid UTF-8 text`); }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(content)) {
      throw new UserError(`gist attachment ${media.path}: binary content is not supported`);
    }
    files[name] = { content };
  }
  return { description: post.title, public: ctx.config.gist.public !== false, files };
}
async function request(ctx: Ctx, path: string, method: string, body?: unknown) {
  return requestJson<{ id: string; html_url: string }>(ctx, "gist", `https://api.github.com${path}`, {
    method, headers: {
      authorization: `Bearer ${ctx.env.GITHUB_TOKEN ?? ""}`, accept: "application/vnd.github+json",
      "content-type": "application/json",
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
export const gist: Destination = {
  id: "gist", kind: "article", env: ["GITHUB_TOKEN"], limit: () => null, payload,
  async preflight(post, ctx) { payload(post, ctx); },
  async verify(ctx) { await request(ctx, "/user", "GET"); },
  async create(post, ctx) {
    const result = await request(ctx, "/gists", "POST", payload(post, ctx));
    return { id: String(result.id), url: result.html_url };
  },
  async update(id, post, ctx) {
    const result = await request(ctx, `/gists/${encodeURIComponent(id)}`, "PATCH", payload(post, ctx));
    return { id: String(result.id), url: result.html_url };
  },
};
