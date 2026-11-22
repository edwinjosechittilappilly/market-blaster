import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.ts";
import { hashnode } from "../src/destinations/hashnode.ts";
import { bluesky } from "../src/destinations/bluesky.ts";
import { mastodon } from "../src/destinations/mastodon.ts";
import { x, linkedin } from "../src/destinations/crosspost.ts";
import { devto } from "../src/destinations/devto.ts";
import { gist } from "../src/destinations/gist.ts";
import { hn, reddit } from "../src/destinations/handoffs.ts";
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
  const ctx = context(mockFetch(() => [200, {}]).fetch);
  ctx.crosspost = () => ({ async post(text, options) { received = text; assert.ok(options.signal); return { data: { id: "42" } }; }, getUrlFromResponse() { return "https://x.com/i/status/42"; } });
  const result = await x.create!(post, ctx, { stage: false });
  assert.equal(received, post.body);
  assert.deepEqual(result, { id: "42", url: "https://x.com/i/status/42" });
  assert.equal(x.cost!(post), 0.20);
});

test("DEV records unpublished creates and never unpublishes a live update", async () => {
  const mock = mockFetch(() => [200, { id: 7, url: "https://dev.to/post" }]);
  const ctx = context(mock.fetch);
  ctx.config.devto.publish = false;
  assert.equal((await devto.create!(post, ctx, { stage: false })).staged, true);
  assert.equal(JSON.parse(mock.calls[0].body).article.published, false);
  assert.equal(mock.calls[0].headers.accept, "application/vnd.forem.api-v1+json");
  assert.equal((await devto.update!("7", post, ctx, { stage: false })).staged, undefined);
  assert.equal(JSON.parse(mock.calls[1].body).article.published, true);
  ctx.config.devto.publish = true;
  assert.equal((await devto.create!(post, ctx, { stage: true })).staged, true);
  await assert.rejects(devto.create!({ ...post, tags: ["Bad"] }, ctx, { stage: false }), /tags/);
  await assert.rejects(devto.create!({ ...post, tags: ["a", "b", "c", "d", "e"] }, ctx, { stage: false }), /tags/);
});

test("HTTP errors are scoped, redirects rejected and bad success bodies uncertain", async () => {
  const ctx = context((async (_url, init) => {
    assert.equal(init?.redirect, "error");
    return new Response("secret ordinary", { status: 301 });
  }) as typeof fetch);
  ctx.env.LANG = "ordinary";
  await assert.rejects(hashnode.verify!(ctx), (err: Error) => err.name === "HttpError" && err.message.includes("*** ordinary") && err.message.includes("paid"));
  ctx.fetch = (async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  await assert.rejects(devto.verify!(ctx), { name: "UncertainResponseError" });
});

test("Bluesky strips link punctuation and configures card", async () => {
  const ctx = context(mockFetch(() => [200, {}]).fetch);
  ctx.config.bluesky.langs = ["fr"];
  const payload = bluesky.payload({ ...post, body: "First https://dev.to/a/b.\n\n  Description  " }, ctx) as any;
  assert.equal(payload.record.facets[0].features[0].uri, "https://dev.to/a/b");
  assert.equal(payload.record.facets[0].index.byteEnd, Buffer.byteLength("First https://dev.to/a/b"));
  assert.equal(payload.record.embed.external.title, "Title");
  assert.equal(payload.record.embed.external.description, "Description");
  assert.deepEqual(payload.record.langs, ["fr"]);
});

test("Crosspost timeout and response mapping", async () => {
  const ctx = context(mockFetch(() => [200, {}]).fetch);
  ctx.timeoutMs = 5;
  ctx.crosspost = () => ({ post: () => new Promise(() => {}), getUrlFromResponse: () => "" });
  await assert.rejects(x.create!(post, ctx, { stage: false }), { name: "TimeoutError" });
  ctx.crosspost = () => ({ async post() { throw Object.assign(new Error("rate limited"), { code: 429 }); }, getUrlFromResponse: () => "" });
  await assert.rejects(linkedin.create!(post, ctx, { stage: false }), { name: "HttpError", status: 429 });
});

test("Gist uses same filename on update; handoffs use canonical", async () => {
  const mock = mockFetch(() => [200, { id: "1", html_url: "https://gist.github.com/1" }]);
  const ctx = context(mock.fetch);
  await gist.create!(post, ctx, { stage: false });
  await gist.update!("1", { ...post, title: "Changed" }, ctx, { stage: false });
  assert.deepEqual(Object.keys(JSON.parse(mock.calls[0].body).files), ["README.md"]);
  assert.deepEqual(Object.keys(JSON.parse(mock.calls[1].body).files), ["README.md"]);
  const hnUrl = new URL(hn.handoff!({ ...post, body: "https://wrong.example" }, ctx).url!);
  assert.equal(hnUrl.searchParams.get("u"), post.canonical);
  assert.equal(hnUrl.searchParams.get("t"), post.title);
  const redditUrl = new URL(reddit.handoff!(post, ctx).url!);
  assert.equal(redditUrl.searchParams.get("url"), post.canonical);
  assert.equal(reddit.handoff!(post, ctx).prefills, "link");
});

test("Hashnode draft and post mutations use their expected inputs", async () => {
  const mock = mockFetch((call) => {
    const query = JSON.parse(call.body).query;
    if (query.includes("createDraft")) return [200, { data: { createDraft: { draft: { id: "d" } } } }];
    if (query.includes("updateDraft")) return [200, { data: { updateDraft: { draft: { id: "d" } } } }];
    if (query.includes("publishDraft")) return [200, { data: { publishDraft: { post: { id: "p", url: "https://hashnode.com/p" } } } }];
    return [200, { data: { updatePost: { post: { id: "p", url: "https://hashnode.com/p" } } } }];
  });
  const ctx = context(mock.fetch);
  await hashnode.create!(post, ctx, { stage: true });
  await hashnode.update!("draft:d", post, ctx, { stage: false });
  await hashnode.update!("p", post, ctx, { stage: false });
  const inputs = mock.calls.map((call) => JSON.parse(call.body).variables.input);
  assert.equal(inputs[0].title, post.title);
  assert.equal(inputs[1].draftId, "d");
  assert.deepEqual(inputs[2], { draftId: "d" });
  assert.equal(inputs[3].id, "p");
});
