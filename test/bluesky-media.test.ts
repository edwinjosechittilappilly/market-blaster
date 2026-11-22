import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";
import { bluesky } from "../src/destinations/bluesky.ts";
import { resolved } from "../src/publisher.ts";
import type { Ctx, ResolvedPost } from "../src/types.ts";
import { mockFetch, tempProject } from "./helpers.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=", "base64");
const blob = { $type: "blob", ref: { $link: "bafktest" }, mimeType: "image/png", size: 1 };
function setup() {
  const dir = tempProject();
  const mock = mockFetch((call) => {
    if (call.url.includes("createSession")) return [200, { did: "did:plc:alice", accessJwt: "session", didDoc: { service: [{ id: "#atproto_pds", serviceEndpoint: "https://alice.host.bsky.network:8443" }] } }];
    if (call.url.includes("getServiceAuth")) return [200, { token: "service-token" }];
    if (call.url.includes("uploadVideo")) return [200, { jobId: "job", state: "JOB_STATE_PROCESSING" }];
    if (call.url.includes("getJobStatus")) return [200, { jobStatus: { jobId: "job", state: "JOB_STATE_COMPLETED", blob } }];
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
  writeFileSync(path, Buffer.concat([png, Buffer.alloc(2_000_000 - png.length)]));
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
  const draft = { destination: "bluesky" as const, body: post.body, evidence: [], path: join(dir, "drafts", "bluesky.md"), media: [{ path: "clip.mp4", kind: "video", alt: "demo", captions: "en.vtt", lang: "fr" }] };
  Object.assign(post, resolved(draft, ctx.config, {}, true));
  await bluesky.create!(post, ctx, { stage: false });
  const auth = mock.calls.find((call) => call.url.includes("getServiceAuth"))!;
  const query = new URL(auth.url).searchParams;
  assert.equal(query.get("aud"), "did:web:alice.host.bsky.network%3A8443");
  assert.equal(query.get("lxm"), "com.atproto.repo.uploadBlob");
  assert.equal(auth.headers.authorization, "Bearer session");
  const upload = mock.calls.find((call) => call.url.includes("uploadVideo"))!;
  assert.equal(upload.headers.authorization, "Bearer service-token");
  assert.equal(new URL(upload.url).searchParams.get("did"), "did:plc:alice");
  const status = mock.calls.find((call) => call.url.includes("getJobStatus"))!;
  assert.equal(new URL(status.url).searchParams.get("jobId"), "job");
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

test("Bluesky preflight probes dimensions before network writes and reuses them at create", async () => {
  const { dir, mock, ctx, post } = setup();
  const path = join(dir, "clip.mp4");
  writeFileSync(path, "video");
  post.media = [{ path, kind: "video", alt: "demo" }];
  let probes = 0;
  ctx.run = async (cmd, args) => {
    probes++;
    assert.equal(cmd, "ffprobe");
    assert.equal(args.at(-1), path);
    return JSON.stringify({ streams: [{ width: 640, height: 480 }] });
  };
  await bluesky.preflight!(post, ctx);
  assert.equal(mock.calls.length, 0);
  await bluesky.create!(post, ctx, { stage: false });
  assert.equal(probes, 1);
  assert.deepEqual(JSON.parse(mock.calls.at(-1)!.body).record.embed.aspectRatio, { width: 640, height: 480 });
});

test("Bluesky rechecks dimensions when media changes after preflight", async () => {
  const { dir, mock, ctx, post } = setup();
  const path = join(dir, "picture.png");
  writeFileSync(path, png);
  post.media = [{ path, kind: "image", alt: "picture" }];
  await bluesky.preflight!(post, ctx);
  writeFileSync(path, "not an image");
  await assert.rejects(bluesky.create!(post, ctx, { stage: false }));
  assert.equal(mock.calls.length, 0);
});

test("Bluesky probes and uploads the approved image bytes", async () => {
  const { dir, mock, ctx, post } = setup();
  const path = join(dir, "picture.png");
  writeFileSync(path, "changed");
  post.media = [{ path, kind: "image", alt: "picture", data: png }];
  await bluesky.create!(post, ctx, { stage: false });
  const upload = mock.calls.find((call) => call.url.includes("uploadBlob"))!;
  assert.equal(upload.body, String(png));
  assert.deepEqual(JSON.parse(mock.calls.at(-1)!.body).record.embed.images[0].aspectRatio, { width: 1, height: 1 });
});

test("Bluesky preflight rejects bad images and failed video probes before network writes", async () => {
  const { dir, mock, ctx, post } = setup();
  const image = join(dir, "bad.png");
  writeFileSync(image, "not an image");
  post.media = [{ path: image, kind: "image", alt: "bad" }];
  await assert.rejects(bluesky.preflight!(post, ctx));
  const video = join(dir, "bad.mp4");
  writeFileSync(video, "video");
  post.media = [{ path: video, kind: "video", alt: "bad" }];
  ctx.run = async () => { throw new Error("ffprobe unavailable"); };
  await assert.rejects(bluesky.preflight!(post, ctx), /ffprobe unavailable/);
  assert.equal(mock.calls.length, 0);
});

for (const existing of [{ blob }, { jobId: "existing", state: "JOB_STATE_PROCESSING" }]) {
  test(`Bluesky accepts already uploaded video with ${"blob" in existing ? "blob" : "job ID"}`, async () => {
    const { dir, ctx, post } = setup();
    const path = join(dir, "clip.mp4");
    writeFileSync(path, "video");
    post.media = [{ path, kind: "video", alt: "demo" }];
    const mock = mockFetch((call) => {
      if (call.url.includes("createSession")) return [200, { did: "did:plc:alice", accessJwt: "session" }];
      if (call.url.includes("getServiceAuth")) return [200, { token: "service-token" }];
      if (call.url.includes("uploadVideo")) return [409, { error: "already_exists", ...existing }];
      if (call.url.includes("getJobStatus")) return [200, { jobStatus: { jobId: "existing", state: "JOB_STATE_COMPLETED", blob } }];
      if (call.url.includes("createRecord")) return [200, { uri: "at://did:plc:alice/app.bsky.feed.post/abc" }];
      throw new Error(`unexpected ${call.url}`);
    });
    ctx.fetch = mock.fetch;
    await bluesky.create!(post, ctx, { stage: false });
    assert.deepEqual(JSON.parse(mock.calls.at(-1)!.body).record.embed.video, blob);
    assert.equal(mock.calls.some((call) => call.url.includes("getJobStatus")), "jobId" in existing);
  });
}

test("Bluesky does not accept unrelated upload errors carrying a job", async () => {
  const { dir, ctx, post } = setup();
  const path = join(dir, "clip.mp4");
  writeFileSync(path, "video");
  post.media = [{ path, kind: "video", alt: "demo" }];
  const mock = mockFetch((call) => {
    if (call.url.includes("createSession")) return [200, { did: "did:plc:alice", accessJwt: "session" }];
    if (call.url.includes("getServiceAuth")) return [200, { token: "service-token" }];
    if (call.url.includes("uploadVideo")) return [429, { error: "RateLimitExceeded", jobId: "job" }];
    throw new Error(`unexpected ${call.url}`);
  });
  ctx.fetch = mock.fetch;
  await assert.rejects(bluesky.create!(post, ctx, { stage: false }), /429/);
  assert.equal(mock.calls.some((call) => call.url.includes("createRecord")), false);
});
