import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";
import { linkedin } from "../src/destinations/crosspost.ts";
import { devto } from "../src/destinations/devto.ts";
import { gist } from "../src/destinations/gist.ts";
import type { Ctx, ResolvedPost } from "../src/types.ts";
import { BASIC_CONFIG, mockFetch, tempProject } from "./helpers.ts";

const post: ResolvedPost = { destination: "linkedin", title: "Example", body: "Hello", contentHash: "hash" };
function setup(files: Record<string, string> = {}) {
  const root = tempProject({ "market-blaster.yml": BASIC_CONFIG, ...files });
  const mock = mockFetch(() => [200, { id: "1", html_url: "https://gist.example/1", url: "https://dev.to/1" }]);
  const ctx: Ctx = { config: loadConfig(root), env: {}, fetch: mock.fetch, timeoutMs: 1000 };
  return { root, mock, ctx };
}

test("LinkedIn passes image bytes and descriptions to Crosspost", async () => {
  const { root, ctx } = setup({ "image.png": "image bytes" });
  let images: { data: Uint8Array; alt: string }[] | undefined;
  ctx.crosspost = () => ({ async post(_text, options) { images = options.images; return { id: "1" }; } });
  const withImage = { ...post, media: [{ path: join(root, "image.png"), alt: "Diagram", kind: "image" }] };
  await linkedin.preflight!(withImage, ctx);
  await linkedin.create!(withImage, ctx, { stage: false });
  assert.equal(images?.[0].alt, "Diagram");
  assert.equal(Buffer.from(images![0].data).toString(), "image bytes");
  await assert.rejects(linkedin.create!({ ...post, media: [{ path: join(root, "carousel.pdf"), alt: "Slides", kind: "document" }] }, ctx, { stage: false }), /manual handoff/);
});

test("DEV sends its hosted cover and preserves hosted inline images", async () => {
  const { ctx, mock } = setup();
  ctx.config.devto.coverUrl = "https://cdn.example/cover.png";
  await devto.create!({ ...post, body: "![diagram](https://cdn.example/diagram.png)",
    media: [{ path: "cover.png", alt: "Cover", kind: "image", cover: true }] }, ctx, { stage: false });
  const article = JSON.parse(mock.calls[0].body).article;
  assert.equal(article.main_image, "https://cdn.example/cover.png");
  assert.equal(article.body_markdown, "![diagram](https://cdn.example/diagram.png)");
  await assert.rejects(devto.create!({ ...post, body: "![diagram](./diagram.png)" }, ctx, { stage: false }), /hosted/);
  assert.equal(mock.calls.length, 1);
});

test("Gist publishes SVG and text files and rejects binary attachments before a write", async () => {
  const { root, ctx, mock } = setup({ "figure.svg": "<svg></svg>", "notes.txt": "notes", "photo.png": "binary", "bad.txt": "hello\u0000world" });
  const withMedia = { ...post, media: [
    { path: join(root, "figure.svg"), alt: "Figure", kind: "image" },
    { path: join(root, "notes.txt"), alt: "Notes", kind: "text" },
  ] };
  await gist.preflight!(withMedia, ctx);
  await gist.create!(withMedia, ctx, { stage: false });
  assert.deepEqual(JSON.parse(mock.calls[0].body).files, {
    "README.md": { content: "Hello" }, "figure.svg": { content: "<svg></svg>" }, "notes.txt": { content: "notes" },
  });
  const binary = { ...post, media: [{ path: join(root, "photo.png"), alt: "Photo", kind: "image" }] };
  await assert.rejects(gist.preflight!(binary, ctx), /only SVG and text/);
  await assert.rejects(gist.create!(binary, ctx, { stage: false }), /only SVG and text/);
  await assert.rejects(gist.preflight!({ ...post, media: [{ path: join(root, "bad.txt"), alt: "Bad", kind: "text" }] }, ctx), /binary content/);
  assert.equal(mock.calls.length, 1);
});
