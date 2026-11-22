import { measureBody } from "../limits.ts";
import type { Ctx, Destination } from "../types.ts";
import { META } from "./meta.ts";
import { requestJson } from "./http.ts";

async function request(ctx: Ctx, path: string, init: RequestInit = {}): Promise<{ id: string; url: string; configuration?: { statuses?: { max_characters?: number } } }> {
  const host = ctx.env.MASTODON_HOST || ctx.config.mastodon.host;
  return requestJson(ctx, "mastodon", `https://${host}${path}`, {
    ...init, headers: { authorization: `Bearer ${ctx.env.MASTODON_TOKEN ?? ""}`, ...init.headers },
  });
}

export const mastodon: Destination = {
  id: "mastodon", kind: "social", env: META.mastodon.env,
  limit: (text, ctx) => measureBody("mastodon", text, ctx.config),
  payload: (post) => new URLSearchParams({ status: post.body, visibility: "public" }).toString(),
  async verify(ctx) {
    await request(ctx, "/api/v1/accounts/verify_credentials");
    const instance = await request(ctx, "/api/v2/instance");
    const max = instance.configuration?.statuses?.max_characters;
    if (typeof max === "number" && max > 0) ctx.config.mastodon.maxChars = max;
  },
  async create(post, ctx) {
    const data = await request(ctx, "/api/v1/statuses", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "idempotency-key": post.contentHash },
      body: new URLSearchParams({ status: post.body, visibility: "public" }).toString(),
    });
    return { id: String(data.id), url: data.url };
  },
};
