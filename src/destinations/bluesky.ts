import { measureBody } from "../limits.ts";
import { HttpError } from "../types.ts";
import type { Ctx, Destination, ResolvedPost } from "../types.ts";
import { META } from "./meta.ts";

async function request(ctx: Ctx, path: string, body: unknown, token?: string): Promise<{ did: string; accessJwt: string; uri: string }> {
  const host = ctx.env.BLUESKY_HOST || ctx.config.bluesky.host || "bsky.social";
  const response = await ctx.fetch(`https://${host}/xrpc/${path}`, {
    method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(ctx.timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) {
    const safe = Object.values(ctx.env).reduce<string>((s, v) => v ? s.split(v).join("***") : s, text.slice(0, 200));
    throw new HttpError(response.status, `bluesky ${response.status}: ${safe}`);
  }
  return JSON.parse(text);
}

async function session(ctx: Ctx) {
  return request(ctx, "com.atproto.server.createSession", { identifier: ctx.env.BLUESKY_IDENTIFIER, password: ctx.env.BLUESKY_APP_PASSWORD });
}

function record(post: ResolvedPost) {
  const encoder = new TextEncoder();
  const matches = [...post.body.matchAll(/https?:\/\/[^\s)>\]]+/g)];
  const facets = matches.map((match) => ({
    index: { byteStart: encoder.encode(post.body.slice(0, match.index)).length, byteEnd: encoder.encode(post.body.slice(0, match.index + match[0].length)).length },
    features: [{ $type: "app.bsky.richtext.facet#link", uri: match[0] }],
  }));
  return {
    $type: "app.bsky.feed.post", text: post.body, createdAt: new Date().toISOString(), langs: ["en"], facets,
    ...(matches.length ? { embed: { $type: "app.bsky.embed.external", external: { uri: matches[0][0], title: post.title || post.body.split("\n")[0], description: "" } } } : {}),
  };
}

export const bluesky: Destination = {
  id: "bluesky", kind: "social", env: META.bluesky.env,
  limit: (text, ctx) => measureBody("bluesky", text, ctx.config),
  payload: (post) => ({ collection: "app.bsky.feed.post", record: record(post) }),
  async verify(ctx) { await session(ctx); },
  async create(post, ctx) {
    const auth = await session(ctx);
    const data = await request(ctx, "com.atproto.repo.createRecord", { repo: auth.did, collection: "app.bsky.feed.post", record: record(post) }, auth.accessJwt);
    const rkey = data.uri.split("/").at(-1);
    return { id: data.uri, url: `https://bsky.app/profile/${auth.did}/post/${rkey}` };
  },
};
