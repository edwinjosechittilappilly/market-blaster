import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";
import { bluesky } from "../src/destinations/bluesky.ts";
import type { Ctx, ResolvedPost } from "../src/types.ts";
import { mockFetch, tempProject } from "./helpers.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=", "base64");
const blob = { $type: "blob", ref: { $link: "bafktest" }, mimeType: "image/png", size: 1 };
function setup() {
  const dir = tempProject();
  const mock = mockFetch((call) => {
    if (call.url.includes("createSession")) return [200, { did: "did:plc:alice", accessJwt: "session" }];
    if (call.url.includes("getServiceAuth")) return [200, { token: "service-token" }];
    if (call.url.includes("uploadVideo")) return [200, { jobId: "job", state: "JOB_STATE_COMPLETED", blob }];
    if (call.url.includes("uploadBlob")) return [200, { blob }];
    if (call.url.includes("createRecord")) return [200, { uri: "at://did:plc:alice/app.bsky.feed.post/abc" }];
    throw new Error(`unexpected ${call.url}`);
  });
  const ctx: Ctx = { fetch: mock.fetch, env: { BLUESKY_IDENTIFIER: "alice", BLUESKY_APP_PASSWORD: "secret" }, config: loadConfig(dir), timeoutMs: 1000, run: async () => JSON.stringify({ streams: [{ width: 1920, height: 1080 }] }) };
  const post: ResolvedPost = { destination: "bluesky", body: "See https://example.com", contentHash: "hash" };
  return { dir, mock, ctx, post };
}

test("Bluesky uploads four images with alt text and replaces the link card", async () => {
  const { dir, mock, ctx, post } = setup();
  post.media = Array.from({ length: 4 }, (_, i) => {
    const path = join(dir, `${i}.png`); writeFileSync(path, png);
    return { path, alt: `image ${i}`, kind: "image" };
  });
  await bluesky.create!(post, ctx, { stage: false });
  const uploads = mock.calls.filter((call) => call.url.includes("uploadBlob"));
  assert.equal(uploads.length, 4);
  assert.equal(uploads[0].headers["content-type"], "image/png");
  const record = JSON.parse(mock.calls.at(-1)!.body).record;
  assert.equal(record.embed.$type, "app.bsky.embed.images");
  assert.equal(record.embed.images.length, 4);
  assert.deepEqual(record.embed.images[0].aspectRatio, { width: 1, height: 1 });
  assert.equal(record.embed.images[0].alt, "image 0");
  assert.equal(record.facets.length, 1);
});

test("Bluesky preflight enforces image count and 2 MB boundary without network writes", async () => {
  const { dir, mock, ctx, post } = setup();
  const path = join(dir, "large.png");
  writeFileSync(path, Buffer.alloc(2_000_000));
  post.media = [{ path, alt: "image", kind: "image" }];
  await bluesky.preflight!(post, ctx);
  writeFileSync(path, Buffer.alloc(2_000_001));
  await assert.rejects(bluesky.preflight!(post, ctx), /2 MB/);
  post.media = Array.from({ length: 5 }, () => ({ path, alt: "image", kind: "image" }));
  await assert.rejects(bluesky.preflight!(post, ctx), /four images/);
  assert.equal(mock.calls.length, 0);
});

test("Bluesky sends a processed video with VTT captions and service-scoped authentication", async () => {
  const { dir, mock, ctx, post } = setup();
  const video = join(dir, "clip.mp4"); const caption = join(dir, "en.vtt");
  writeFileSync(video, "video"); writeFileSync(caption, "WEBVTT\n\n");
  post.media = [{ path: video, kind: "video", alt: "demo" }, { path: caption, kind: "vtt", alt: "captions", lang: "fr" }];
  await bluesky.create!(post, ctx, { stage: false });
  const auth = mock.calls.find((call) => call.url.includes("getServiceAuth"))!;
  const query = new URL(auth.url).searchParams;
  assert.equal(query.get("aud"), "did:web:bsky.social");
  assert.equal(query.get("lxm"), "com.atproto.repo.uploadBlob");
  assert.equal(auth.headers.authorization, "Bearer session");
  const upload = mock.calls.find((call) => call.url.includes("uploadVideo"))!;
  assert.equal(upload.headers.authorization, "Bearer service-token");
  assert.equal(new URL(upload.url).searchParams.get("did"), "did:plc:alice");
  assert.equal(mock.calls.find((call) => new URL(call.url).pathname.endsWith("/com.atproto.repo.uploadBlob"))!.headers["content-type"], "text/vtt");
  const embed = JSON.parse(mock.calls.at(-1)!.body).record.embed;
  assert.equal(embed.$type, "app.bsky.embed.video");
  assert.deepEqual(embed.aspectRatio, { width: 1920, height: 1080 });
  assert.deepEqual(embed.captions, [{ lang: "fr", file: blob }]);
});

test("Bluesky stops before creating a post when video processing fails", async () => {
  const { dir, ctx, post } = setup();
  const path = join(dir, "clip.mp4");
  writeFileSync(path, "video");
  post.media = [{ path, kind: "video", alt: "demo" }];
  const mock = mockFetch((call) => {
    if (call.url.includes("createSession")) return [200, { did: "did:plc:alice", accessJwt: "session" }];
    if (call.url.includes("getServiceAuth")) return [200, { token: "service-token" }];
    if (call.url.includes("uploadVideo")) return [200, { jobId: "job", state: "JOB_STATE_FAILED", error: "InvalidVideo" }];
    throw new Error(`unexpected ${call.url}`);
  });
  ctx.fetch = mock.fetch;
  await assert.rejects(bluesky.create!(post, ctx, { stage: false }), /InvalidVideo/);
  assert.equal(mock.calls.some((call) => call.url.includes("createRecord")), false);
});
