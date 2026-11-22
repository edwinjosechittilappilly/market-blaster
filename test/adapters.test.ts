import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.ts";
import { hashnode } from "../src/destinations/hashnode.ts";
import { bluesky } from "../src/destinations/bluesky.ts";
import { mastodon } from "../src/destinations/mastodon.ts";
import { x, setStrategyFactory } from "../src/destinations/crosspost.ts";
import type { Ctx, ResolvedPost } from "../src/types.ts";
import { mockFetch, tempProject } from "./helpers.ts";

const post: ResolvedPost = { destination: "hashnode", title: "Title", body: "Café ✨ https://dev.to/x", canonical: "https://dev.to/x", contentHash: "hash" };
function context(fetch: typeof globalThis.fetch): Ctx {
  return { fetch, env: { HASHNODE_TOKEN: "secret", BLUESKY_IDENTIFIER: "user", BLUESKY_APP_PASSWORD: "password", MASTODON_TOKEN: "token" }, config: loadConfig(tempProject()), timeoutMs: 1000 };
}

test("Hashnode sends canonical and raw authorization, surfaces GraphQL errors", async () => {
  const mock = mockFetch(() => [200, { data: { publishPost: { post: { id: "1", url: "https://hashnode.com/post" } } } }]);
  await hashnode.create!(post, context(mock.fetch), { stage: false });
  assert.equal(mock.calls[0].headers.authorization, "secret");
  assert.equal(JSON.parse(mock.calls[0].body).variables.input.originalArticleURL, post.canonical);
  const failure = mockFetch(() => [200, { errors: [{ message: "bad" }] }]);
  await assert.rejects(hashnode.create!(post, context(failure.fetch), { stage: false }), /hashnode 422/);
});

test("Bluesky uses UTF-8 offsets and external embed", async () => {
  const mock = mockFetch((call) => call.url.endsWith("createSession") ? [200, { did: "did:plc:123", accessJwt: "jwt" }] : [200, { uri: "at://did:plc:123/app.bsky.feed.post/abc" }]);
  const result = await bluesky.create!(post, context(mock.fetch), { stage: false });
  const record = JSON.parse(mock.calls[1].body).record;
  const start = Buffer.byteLength("Café ✨ ");
  assert.deepEqual(record.facets[0].index, { byteStart: start, byteEnd: start + Buffer.byteLength("https://dev.to/x") });
  assert.equal(record.embed.external.uri, "https://dev.to/x");
  assert.equal(result.url, "https://bsky.app/profile/did:plc:123/post/abc");
});

test("Mastodon uses idempotency key and loads instance limit", async () => {
  const mock = mockFetch((call) => call.url.endsWith("instance") ? [200, { configuration: { statuses: { max_characters: 900 } } }] : [200, { id: "1", url: "https://mastodon.example/@x/1" }]);
  const ctx = context(mock.fetch);
  await mastodon.verify!(ctx);
  assert.equal(ctx.config.mastodon.maxChars, 900);
  await mastodon.create!(post, ctx, { stage: false });
  assert.equal(mock.calls[2].headers["idempotency-key"], "hash");
  assert.equal(new URLSearchParams(mock.calls[2].body).get("status"), post.body);
});

test("X strategy receives resolved body and computes link cost", async () => {
  let received = "";
  setStrategyFactory(() => ({ async post(text, options) { received = text; assert.ok(options.signal); return { data: { id: "42" } }; }, getUrlFromResponse() { return "https://x.com/i/status/42"; } }));
  const result = await x.create!(post, context(mockFetch(() => [200, {}]).fetch), { stage: false });
  assert.equal(received, post.body);
  assert.deepEqual(result, { id: "42", url: "https://x.com/i/status/42" });
  assert.equal(x.cost!(post), 0.20);
});
