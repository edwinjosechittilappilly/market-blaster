import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";
import { mastodon } from "../src/destinations/mastodon.ts";
import { MediaUploadError, type Ctx, type ResolvedPost } from "../src/types.ts";
import { BASIC_CONFIG, mockFetch, tempProject } from "./helpers.ts";

function fixture(fetch: typeof globalThis.fetch, name = "image.png") {
  const dir = tempProject({ "market-blaster.yml": BASIC_CONFIG, [name]: "1234" });
  const ctx: Ctx = { fetch, env: { MASTODON_TOKEN: "token" }, config: loadConfig(dir), timeoutMs: 1000 };
  const post: ResolvedPost = {
    destination: "mastodon", body: "Hello", contentHash: "hash",
    media: [{ path: join(dir, name), kind: name.endsWith(".mp4") ? "video" : "image", alt: "A description" }],
  };
  return { ctx, post };
}

function fakeClock(ctx: Ctx) {
  let now = 0;
  const sleeps: number[] = [];
  ctx.now = () => now;
  ctx.sleep = async (ms) => { sleeps.push(ms); now += ms; };
  return sleeps;
}

test("Mastodon preflight reads instance limits before rejecting oversized media", async () => {
  const net = mockFetch(() => [200, { configuration: { media_attachments: { image_size_limit: 3 } } }]);
  const { ctx, post } = fixture(net.fetch);
  await assert.rejects(mastodon.preflight!(post, ctx), /exceeds instance limit 3/);
  assert.deepEqual(net.calls.map(({ method, url }) => [method, new URL(url).pathname]), [["GET", "/api/v2/instance"]]);
});

test("Mastodon uploads descriptions and polls video before creating a status", async () => {
  let upload: FormData | undefined;
  const net = mockFetch((call) => {
    if (call.url.endsWith("/api/v2/media")) return [202, { id: "media/1", url: null }];
    if (call.url.endsWith("/api/v1/media/media%2F1")) return [200, { id: "media/1", url: "https://example.test/video" }];
    return [200, { id: "status", url: "https://example.test/status" }];
  });
  const fetch: typeof globalThis.fetch = async (input, init) => {
    if (init?.body instanceof FormData) upload = init.body;
    return net.fetch(input, init);
  };
  const { ctx, post } = fixture(fetch, "clip.mp4");
  fakeClock(ctx);
  const result = await mastodon.create!(post, ctx, { stage: false });
  assert.equal(upload?.get("description"), "A description");
  const file = upload?.get("file") as File;
  assert.equal(file.name, "clip.mp4");
  assert.equal(file.type, "video/mp4");
  assert.equal(await file.text(), "1234");
  assert.deepEqual(net.calls.map(({ method }) => method), ["POST", "GET", "POST"]);
  assert.equal(new URLSearchParams(net.calls[2].body).get("media_ids[]"), "media/1");
  assert.equal(net.calls[2].headers["idempotency-key"], "hash");
  assert.equal(result.id, "status");
});

test("Mastodon uploads the approved bytes when supplied", async () => {
  let uploaded: File | undefined;
  const net = mockFetch((call) => call.url.endsWith("/api/v2/media")
    ? [200, { id: "media", url: "https://example.test/media" }]
    : [200, { id: "status", url: "https://example.test/status" }]);
  const fetch: typeof globalThis.fetch = async (input, init) => {
    if (init?.body instanceof FormData) uploaded = init.body.get("file") as File;
    return net.fetch(input, init);
  };
  const { ctx, post } = fixture(fetch);
  post.media![0].data = Buffer.from("approved");
  await mastodon.preflight!(post, ctx);
  await mastodon.create!(post, ctx, { stage: false });
  assert.equal(await uploaded?.text(), "approved");
});

test("Mastodon never creates a status after a 422 media processing failure", async () => {
  const net = mockFetch((call) => call.url.endsWith("/api/v2/media")
    ? [202, { id: "media", url: null }] : [422, { error: "processing failed" }]);
  const { ctx, post } = fixture(net.fetch, "clip.mp4");
  fakeClock(ctx);
  await assert.rejects(mastodon.create!(post, ctx, { stage: false }), (err: unknown) => {
    assert.ok(err instanceof MediaUploadError);
    assert.match(String(err.cause), /422.*processing failed/);
    return true;
  });
  assert.equal(net.calls.length, 2);
  assert.ok(net.calls.every(({ url }) => !url.endsWith("/api/v1/statuses")));
});

test("Mastodon also rejects processing errors in successful responses", async () => {
  const net = mockFetch((call) => call.url.endsWith("/api/v2/media")
    ? [202, { id: "media", url: null }] : [200, { id: "media", error: "processing failed" }]);
  const { ctx, post } = fixture(net.fetch, "clip.mp4");
  fakeClock(ctx);
  await assert.rejects(mastodon.create!(post, ctx, { stage: false }), MediaUploadError);
  assert.ok(net.calls.every(({ url }) => !url.endsWith("/api/v1/statuses")));
});

test("Mastodon preflight applies instance type, count, and description limits", async () => {
  const net = mockFetch(() => [200, { configuration: { statuses: { max_media_attachments: 1 }, media_attachments: {
    supported_mime_types: ["image/png"], image_size_limit: 4, description_limit: 13,
  } } }]);
  const { ctx, post } = fixture(net.fetch);
  await mastodon.preflight!(post, ctx);
  await assert.rejects(mastodon.preflight!({ ...post, media: [...post.media!, ...post.media!] }, ctx), /attachments exceeds/);
  await assert.rejects(mastodon.preflight!({ ...post, media: [{ ...post.media![0], alt: "a longer description" }] }, ctx), /description exceeds/);
  const video = fixture(net.fetch, "clip.mp4");
  await assert.rejects(mastodon.preflight!(video.post, video.ctx), /unsupported media type/);
  assert.ok(net.calls.every(({ method }) => method === "GET"));
});

test("Mastodon preflight rejects incompatible attachments and configured size limits", async () => {
  const net = mockFetch(() => [200, {}]);
  const { ctx, post } = fixture(net.fetch);
  const video = fixture(net.fetch, "clip.mp4").post.media![0];
  await assert.rejects(mastodon.preflight!({ ...post, media: [...post.media!, video] }, ctx), /video cannot be combined/);
  await assert.rejects(mastodon.preflight!({ ...post, media: [{ ...post.media![0], path: "image.txt" }] }, ctx), /unsupported media type/);
  ctx.config.mastodon.imageSizeLimit = 3;
  await assert.rejects(mastodon.preflight!(post, ctx), /exceeds instance limit 3/);
  assert.ok(net.calls.every(({ method }) => method === "GET"));
});

test("Mastodon preflight checks every attachment before uploads", async () => {
  const net = mockFetch(() => [200, {}]);
  const { ctx, post } = fixture(net.fetch);
  await assert.rejects(mastodon.preflight!({
    ...post, media: [...post.media!, { ...post.media![0], path: join(ctx.config.root, "missing.png") }],
  }, ctx), /ENOENT/);
  assert.ok(net.calls.every(({ method }) => method === "GET"));
});

test("Mastodon polls past ten seconds and publishes when processing completes", async () => {
  let polls = 0;
  const net = mockFetch((call) => {
    if (call.url.endsWith("/api/v2/media")) return [202, { id: "media", url: null }];
    if (call.url.endsWith("/api/v1/statuses")) return [200, { id: "status", url: "https://example.test/status" }];
    return [200, { id: "media", url: ++polls === 5 ? "https://example.test/media" : null }];
  });
  const { ctx, post } = fixture(net.fetch, "clip.mp4");
  const sleeps = fakeClock(ctx);
  const result = await mastodon.create!(post, ctx, { stage: false });
  assert.ok(sleeps.reduce((sum, ms) => sum + ms, 0) > 10_000);
  assert.equal(result.id, "status");
});

test("Mastodon stops polling at its configured processing deadline", async () => {
  const net = mockFetch(() => [200, { id: "media", url: null }]);
  const { ctx, post } = fixture(net.fetch, "clip.mp4");
  ctx.config.mastodon.processingTimeoutMs = 2500;
  const sleeps = fakeClock(ctx);
  await assert.rejects(mastodon.create!(post, ctx, { stage: false }), MediaUploadError);
  assert.equal(sleeps.reduce((sum, ms) => sum + ms, 0), 2500);
  assert.ok(net.calls.every(({ url }) => !url.endsWith("/api/v1/statuses")));
});

test("Mastodon defaults to a ten minute media processing deadline", async () => {
  const net = mockFetch(() => [200, { id: "media", url: null }]);
  const { ctx, post } = fixture(net.fetch, "clip.mp4");
  const sleeps = fakeClock(ctx);
  await assert.rejects(mastodon.create!(post, ctx, { stage: false }), MediaUploadError);
  assert.equal(sleeps.reduce((sum, ms) => sum + ms, 0), 600_000);
  assert.ok(net.calls.every(({ url }) => !url.endsWith("/api/v1/statuses")));
});

test("Mastodon upload failures do not create a status", async () => {
  const net = mockFetch(() => [422, { error: "invalid media" }]);
  const { ctx, post } = fixture(net.fetch);
  await assert.rejects(mastodon.create!(post, ctx, { stage: false }), MediaUploadError);
  assert.equal(net.calls.length, 1);
  assert.ok(net.calls[0].url.endsWith("/api/v2/media"));
});
