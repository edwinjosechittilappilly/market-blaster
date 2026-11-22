import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { extractCampaignZip } from "../src/campaign-zip.ts";
import { run } from "../src/commands/import.ts";
import { loadDrafts } from "../src/drafts.ts";
import { reviewHash } from "../src/manifest.ts";
import { fakeIO, tempProject } from "./helpers.ts";

function fixture() {
  const root = tempProject({ "market-blaster.yml": "brand:\n  name: Demo\ndestinations: [bluesky, mastodon]\n" });
  const media = [{ path: "media/image.png", alt: "Picture", kind: "image" }];
  const hash = reviewHash({ body: "Hello", media });
  const destination = { id: "bluesky", mode: "api", aiPolicy: "draft", post: "posts/bluesky.md", media,
    thread: "handoff/bluesky-thread.md", review: { verdict: "pass", total: 90, reviewHash: hash } };
  const manifest = { version: 2, kind: "blast-studio-campaign", slug: "demo", title: "Demo", generatedAt: "2026-01-01T00:00:00Z",
    generator: { name: "blast-studio", version: "0.1.0" }, canonicalHome: "devto", sources: [{ anchor: "E1", title: "Source", status: "claim" }],
    destinations: [destination, { ...destination, id: "linkedin", post: "posts/linkedin.md", thread: null }],
    manual: [{ platform: "tiktok", folder: "handoff/tiktok/", review: { verdict: "pass", total: 80 } }] };
  const zip = zipSync({ "campaign.json": strToU8(JSON.stringify(manifest)), "brief.md": strToU8("## [E1] Source\nHello\n"),
    "posts/bluesky.md": strToU8("---\nevidence: [E1]\n---\nHello\n"), "posts/linkedin.md": strToU8("---\nevidence: [E1]\n---\nHello\n"),
    "media/image.png": strToU8("image"), "sources/sources.json": strToU8("[]"), "sources/E1.md": strToU8("source"),
    "handoff/bluesky-thread.md": strToU8("thread"), "handoff/tiktok/README.md": strToU8("manual"), "review/review.md": strToU8("review") });
  const file = join(root, "demo.campaign.zip");
  writeFileSync(file, zip);
  return { root, file, io: fakeIO({ cwd: root }), campaign: join(root, "campaigns/demo") };
}

test("imports a Studio campaign and reports destinations and manual handoffs", async () => {
  const f = fixture();
  assert.equal(await run([f.file], f.io), 0);
  const drafts = loadDrafts(f.campaign);
  assert.equal(drafts.get("bluesky")?.body, "Hello");
  assert.equal(drafts.get("bluesky")?.media?.[0].path, "media/image.png");
  assert.equal(readFileSync(join(f.campaign, "media/image.png"), "utf8"), "image");
  assert.equal(drafts.get("mastodon")?.skip, "not planned in studio");
  assert.equal(existsSync(join(f.campaign, "drafts/linkedin.md")), false);
  for (const path of ["sources/E1.md", "handoff/bluesky-thread.md", "handoff/tiktok/README.md", "review/review.md"]) assert.ok(existsSync(join(f.campaign, path)));
  assert.match(f.io.text(), /Not enabled: linkedin/);
  assert.match(f.io.text(), /- linkedin/);
  assert.match(f.io.text(), /Manual: tiktok/);
  assert.doesNotMatch(f.io.text(), /stale/);
});

test("protects approved drafts and permits a forced replacement", async () => {
  const f = fixture();
  await run([f.file], f.io);
  const path = join(f.campaign, "drafts/bluesky.md");
  const before = readFileSync(path, "utf8");
  writeFileSync(join(f.campaign, "state.json"), JSON.stringify({ bluesky: { approvedHash: "approved" } }));
  await assert.rejects(run([f.file], f.io), /approved drafts/);
  assert.equal(readFileSync(path, "utf8"), before);
  await run([f.file, "--force"], f.io);
  assert.equal(JSON.parse(readFileSync(join(f.campaign, "state.json"), "utf8")).bluesky.approvedHash, undefined);
});

test("rejects unsafe archive paths and symbolic links", () => {
  const root = tempProject({});
  const file = join(root, "bad.zip");
  const target = join(root, "out");
  mkdirSync(target);
  for (const name of ["../x", "/absolute", "C:/file", "a\\b"]) {
    writeFileSync(file, zipSync({ [name]: strToU8("x") }));
    assert.throws(() => extractCampaignZip(file, target), /unsafe path/);
  }
  const zip = Buffer.from(zipSync({ link: strToU8("target") }));
  const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  zip.writeUInt32LE(0xa1ff0000, central + 38);
  writeFileSync(file, zip);
  assert.throws(() => extractCampaignZip(file, target), /symlink/);
});

test("rejects archive entry, total, count and compression ratio limits", () => {
  const root = tempProject({});
  const file = join(root, "large.zip");
  const target = join(root, "out");
  mkdirSync(target);
  writeFileSync(file, zipSync({ a: strToU8("a".repeat(100)), b: strToU8("another") }));
  assert.throws(() => extractCampaignZip(file, target, { maxEntry: 99 }), /size limit/);
  assert.throws(() => extractCampaignZip(file, target, { maxTotal: 105 }), /size limit/);
  assert.throws(() => extractCampaignZip(file, target, { maxEntries: 1 }), /too many/);
  assert.throws(() => extractCampaignZip(file, target, { maxRatio: 2 }), /ratio/);
});
