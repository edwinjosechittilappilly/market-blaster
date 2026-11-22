import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { run } from "../src/commands/import.ts";
import { checkCampaign } from "../src/check.ts";
import { loadConfig } from "../src/config.ts";
import { loadDrafts } from "../src/drafts.ts";
import { reviewHash } from "../src/manifest.ts";
import { fakeIO, tempProject } from "./helpers.ts";

function setup() {
  const root = tempProject({ "market-blaster.yml": "brand:\n  name: Demo\ndestinations: [bluesky, mastodon]\n" });
  const pkg = join(root, "package");
  mkdirSync(join(pkg, "assets"), { recursive: true });
  writeFileSync(join(pkg, "brief.md"), "## [E1] Evidence\nHello\n");
  writeFileSync(join(pkg, "assets", "img.png"), "image");
  const post = { platform: "bluesky", destination: "bluesky", body: "Hello", evidence: ["E1"],
    media: [{ path: "assets/img.png", alt: "An image", kind: "image" }], thread: ["Second post"],
    review: { verdict: "pass", total: 90, reviewHash: "" } };
  post.review.reviewHash = reviewHash(post);
  const manifest = { version: 1, slug: "demo", generatedAt: "2026-01-01T00:00:00Z", brief: "brief.md", posts: [post] };
  const save = () => writeFileSync(join(pkg, "manifest.json"), JSON.stringify(manifest));
  save();
  return { root, pkg, manifest, save, io: fakeIO({ cwd: root }), campaign: join(root, "campaigns", "demo") };
}

test("review hash shared vector", () => {
  assert.equal(reviewHash({ title: "T", body: "  Hello\n", media: [{ path: "a/img.png", alt: " Alt ", kind: "image" }] }),
    "5d5491c0f7ae06bef68e9dabfd55f2e6c8152f8e6fdb96cd24d294cd203bc977");
});

test("imports media, skips, review and thread and detects stale edits", async () => {
  const s = setup();
  assert.equal(await run([s.pkg], s.io), 0);
  const drafts = loadDrafts(s.campaign);
  const post = drafts.get("bluesky")!;
  assert.equal(post.body, "Hello");
  assert.equal(post.studio?.verdict, "pass");
  assert.equal(readFileSync(join(s.campaign, post.media![0].path), "utf8"), "image");
  assert.equal(drafts.get("mastodon")?.skip, "not planned in studio");
  assert.match(readFileSync(join(s.campaign, "handoff/bluesky-thread.md"), "utf8"), /Second post/);
  assert.doesNotMatch(s.io.text(), /stale/);
  const path = join(s.campaign, "drafts/bluesky.md");
  writeFileSync(path, readFileSync(path, "utf8").replace("Hello", "Edited"));
  assert.ok(checkCampaign(loadConfig(s.root), s.campaign).findings.some((f) => f.message.includes("stale")));
});

test("refuses approved replacements atomically and force clears approval", async () => {
  const s = setup();
  assert.equal(await run([s.pkg], s.io), 0);
  const draft = join(s.campaign, "drafts/bluesky.md");
  const before = readFileSync(draft, "utf8");
  writeFileSync(join(s.campaign, "state.json"), JSON.stringify({ mastodon: { approvedHash: "approved" } }));
  s.manifest.posts[0].body = "changed"; s.save();
  await assert.rejects(run([s.pkg], s.io), /approved drafts/);
  assert.equal(readFileSync(draft, "utf8"), before);
  assert.equal(await run([s.pkg, "--force"], s.io), 0);
  assert.equal(JSON.parse(readFileSync(join(s.campaign, "state.json"), "utf8")).mastodon.approvedHash, undefined);
});

test("rejects unsupported or escaping packages before writing drafts", async () => {
  const s = setup();
  s.manifest.version = 2; s.save();
  await assert.rejects(run([s.pkg], s.io), /version/);
  s.manifest.version = 1; s.manifest.posts[0].media[0].path = "../market-blaster.yml"; s.save();
  await assert.rejects(run([s.pkg], s.io), /package file/);
});

test("reports failed media validation after import", async () => {
  const s = setup();
  s.manifest.posts[0].media[0].alt = " "; s.save();
  assert.equal(await run([s.pkg], s.io), 1);
  assert.match(s.io.text(), /missing alt text/);
  const path = join(s.campaign, "drafts/bluesky.md");
  writeFileSync(path, readFileSync(path, "utf8").replace(/media\/[^/]+\/img.png/, "media/missing.png"));
  assert.ok(checkCampaign(loadConfig(s.root), s.campaign).findings.some((f) => f.message.includes("missing or not campaign-local")));
});

test("imports cover and caption metadata and copies the VTT", async () => {
  const s = setup();
  writeFileSync(join(s.pkg, "assets/captions.vtt"), "WEBVTT\n");
  Object.assign(s.manifest.posts[0].media[0], {
    kind: "video", cover: true, lang: "en-US", captions: "assets/captions.vtt",
  });
  s.save();
  assert.equal(await run([s.pkg], s.io), 0);
  const media = loadDrafts(s.campaign).get("bluesky")!.media![0];
  assert.equal(media.cover, true);
  assert.equal(media.lang, "en-US");
  assert.equal(readFileSync(join(s.campaign, media.captions!), "utf8"), "WEBVTT\n");
});
