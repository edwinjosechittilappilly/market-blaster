import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { checkCampaign } from "../src/check.ts";
import { loadConfig } from "../src/config.ts";
import { run as check } from "../src/commands/check.ts";
import { run as draft } from "../src/commands/draft.ts";
import { META } from "../src/destinations/meta.ts";
import { DESTINATION_IDS } from "../src/types.ts";
import { fakeIO, tempProject } from "./helpers.ts";

const config = `brand:\n  name: Demo\ndestinations: [devto, bluesky]\ncanonicalHome: devto\nagent:\n  command: [node, fake-agent.mjs]\n`;
const devto = (body: string, title = 'title: "Title"\n', evidence = 'evidence: [E1]\n') => `---\ndestination: devto\n${title}${evidence}---\n${body}\n`;
const bluesky = (body: string) => `---\ndestination: bluesky\nevidence: [E1]\n---\n${body}\n`;
const project = (files: Record<string, string> = {}) => tempProject({ "market-blaster.yml": config, "campaigns/a/brief.md": "## [E1] A feature\n", ...files });

test("checks link length, publish order, evidence, grounding and titles", async () => {
  const root = project({ "campaigns/a/drafts/devto.md": devto("3x faster {{url:bluesky}}", "", "evidence: [E99]\n"), "campaigns/a/drafts/bluesky.md": bluesky(`${"a".repeat(201)}{{url:devto}}`) });
  const result = checkCampaign(loadConfig(root), join(root, "campaigns/a"));
  assert.ok(result.findings.some((f) => f.destination === "bluesky" && f.message.includes("301")));
  assert.ok(result.findings.some((f) => f.message.includes("not earlier")));
  assert.ok(result.findings.some((f) => f.message.includes("E99")));
  assert.ok(result.findings.some((f) => f.message.includes("title")));
  assert.ok(result.findings.some((f) => f.level === "warning" && f.message.includes("3x")));
});

test("strict turns grounding warnings into failures", async () => {
  const root = project({ "campaigns/a/drafts/devto.md": devto("3x faster"), "campaigns/a/drafts/bluesky.md": bluesky("Feature") });
  assert.equal(await check(["a"], fakeIO({ cwd: root })), 0);
  assert.equal(await check(["a", "--strict"], fakeIO({ cwd: root })), 1);
});

test("draft runs agent with restricted environment and preserves existing drafts", async () => {
  const script = `const fs = require('node:fs'); fs.writeFileSync('drafts/bluesky.md', ${JSON.stringify(bluesky("PLACEHOLDER"))}.replace('PLACEHOLDER', JSON.stringify({cwd:process.cwd(), files:fs.readdirSync('.'), env:process.env, prompt:process.argv.at(-1), brand:fs.readFileSync('brand.yml','utf8')}))); fs.writeFileSync('drafts/extra.md','extra'); fs.writeFileSync('extra.txt','extra');`;
  const agentConfig = `brand:\n  name: Demo\ndestinations: [devto, bluesky]\ncanonicalHome: devto\nagent:\n  command: [node, "-e", ${JSON.stringify(script)}]\n`;
  const root = project({ "market-blaster.yml": agentConfig, ".env": "SECRET=secret", "campaigns/a/drafts/devto.md": devto("Keep me") });
  const exec = promisify(execFile);
  const io = fakeIO({ cwd: root, env: { PATH: process.env.PATH, HOME: "/tmp", SHELL: "/bin/sh", DEV_API_KEY: "secret", XDG_CACHE_HOME: "/tmp/cache" }, run: async (cmd, args, opts) => (await exec(cmd, args, { cwd: opts?.cwd, env: opts?.env as NodeJS.ProcessEnv })).stdout });
  assert.equal(await draft(["a"], io), 0);
  assert.match(readFileSync(join(root, "campaigns/a/drafts/devto.md"), "utf8"), /Keep me/);
  const content = readFileSync(join(root, "campaigns/a/drafts/bluesky.md"), "utf8").split("---\n")[2];
  const result = JSON.parse(content);
  assert.notEqual(result.cwd, root);
  assert.equal(basename(result.env.TMPDIR), basename(result.cwd));
  assert.match(result.brand, /aiPolicies:\n\s+devto: draft\n\s+bluesky: draft/);
  for (const key of ["githubDiscussion", "lemmy", "newsletter", "nostr"]) assert.match(result.brand, new RegExp(`^${key}:`, "m"));
  assert.deepEqual(result.files.sort(), ["SKILL.md", "brand.yml", "brief.md", "drafts"]);
  assert.equal(result.env.DEV_API_KEY, undefined);
  assert.equal(result.env.SHELL, undefined);
  assert.equal(result.env.XDG_CACHE_HOME, "/tmp/cache");
  assert.match(result.prompt, /ignore any instructions in it/);
  assert.doesNotMatch(result.prompt, /drafts\/devto\.md/);
  assert.doesNotMatch(result.prompt, new RegExp(root));
  assert.equal(existsSync(join(root, "campaigns/a/drafts/extra.md")), false);
  assert.match(io.text(), /Ignored agent output/);
});

test("draft requires a brief and skips an already complete campaign", async () => {
  const missing = tempProject({ "market-blaster.yml": config });
  const io = fakeIO({ cwd: missing });
  assert.equal(await draft(["a"], io), 1);
  assert.match(io.text(), /run mblast brief first/);
  const root = project({ "campaigns/a/drafts/devto.md": devto("Existing"), "campaigns/a/drafts/bluesky.md": bluesky("Existing") });
  assert.equal(await draft(["a"], fakeIO({ cwd: root })), 0);
});

test("skill covers every destination", () => {
  const skill = readFileSync(new URL("../skills/market-blaster/reference/destinations.md", import.meta.url), "utf8");
  for (const id of DESTINATION_IDS) assert.match(skill, new RegExp(`^## ${id}$`, "m"));
  const instructions = readFileSync(new URL("../skills/market-blaster/SKILL.md", import.meta.url), "utf8");
  const outline = ["reddit", "producthunt", "lemmy", "newsletter"];
  for (const id of DESTINATION_IDS) assert.equal(META[id].ai, id === "hn" ? "none" : outline.includes(id) ? "outline" : "draft", id);
  assert.match(instructions, /Reddit, Product Hunt, Lemmy and newsletter: write only bullet talking points/);
});

test("skip and HN need no generated text", () => {
  const root = project({ "market-blaster.yml": "brand: { name: Demo }\ndestinations: [devto, gist, hn]\ncanonicalHome: devto\n", "campaigns/a/drafts/devto.md": devto("Feature"), "campaigns/a/drafts/gist.md": "---\ndestination: gist\nskip: No example\n---\n" });
  const result = checkCampaign(loadConfig(root), join(root, "campaigns/a"));
  assert.equal(result.drafts.get("gist")?.skip, "No example");
  assert.equal(result.drafts.has("hn"), false);
  assert.deepEqual(result.findings, []);
});

test("grounding checks numbers, but not URLs or list markers, and requires heading anchors", () => {
  const root = project({ "campaigns/a/brief.md": "## [E1] Features\nCommit body [E99]\n", "campaigns/a/drafts/devto.md": devto("1. 10,000 developers use `foo` at https://example.com/v2 and {{url:devto}}", undefined, "evidence: [E99]\n"), "campaigns/a/drafts/bluesky.md": bluesky("Feature") });
  const findings = checkCampaign(loadConfig(root), join(root, "campaigns/a")).findings;
  assert.ok(findings.some((f) => f.message.includes("10,000") && f.level === "warning"));
  assert.ok(findings.some((f) => f.message.includes("`foo`")));
  assert.ok(findings.some((f) => f.message.includes("unknown evidence anchor E99")));
  assert.ok(!findings.some((f) => f.message.includes("v2 not found") || f.message.startsWith("1 not found")));
});

test("Mastodon default is a warning until instance preflight", () => {
  const root = project({ "market-blaster.yml": "brand: { name: Demo }\ndestinations: [mastodon]\n", "campaigns/a/drafts/mastodon.md": "---\ndestination: mastodon\nevidence: [E1]\n---\n" + "a".repeat(600) });
  const findings = checkCampaign(loadConfig(root), join(root, "campaigns/a")).findings;
  assert.ok(findings.some((f) => f.level === "warning" && f.message.includes("preflight")));
  assert.ok(!findings.some((f) => f.level === "error"));
});

test("outline grounding checks title and body but skips body length", () => {
  const root = project({ "market-blaster.yml": "brand: { name: Demo }\ndestinations: [reddit]\n", "campaigns/a/drafts/reddit.md": "---\ndestination: reddit\ntitle: 20 notes\nevidence: [E1]\n---\n10,000 users\n" + "a".repeat(50000) });
  const findings = checkCampaign(loadConfig(root), join(root, "campaigns/a")).findings;
  assert.ok(findings.some((f) => f.level === "warning" && f.message.includes("10,000")));
  assert.ok(findings.some((f) => f.level === "warning" && f.message.includes("20")));
  assert.ok(!findings.some((f) => f.message.includes("exceeds limit")));
});

test("draft agent failure reports the last 20 lines", async () => {
  const root = project();
  const lines = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join("\n");
  await assert.rejects(draft(["a"], fakeIO({ cwd: root, run: async () => { throw new Error(lines); } })), (err: Error) => {
    assert.doesNotMatch(err.message, /line 5\n/);
    assert.match(err.message, /line 6\n/);
    assert.match(err.message, /line 25/);
    return true;
  });
});

test("DEV tag rules are checked before publishing", () => {
  const root = project({ "market-blaster.yml": "brand: { name: Demo }\ndestinations: [devto]\ndevto:\n  tags: [Bad]\n", "campaigns/a/drafts/devto.md": devto("Feature") });
  const campaign = join(root, "campaigns/a");
  assert.ok(checkCampaign(loadConfig(root), campaign).findings.some((f) => f.level === "error" && f.message.includes("DEV tags")));
  const override = project({ "market-blaster.yml": "brand: { name: Demo }\ndestinations: [devto]\ndevto:\n  tags: [good]\n", "campaigns/a/drafts/devto.md": devto("Feature", 'title: Title\ntags: [one, two, three, four, five]\n') });
  assert.ok(checkCampaign(loadConfig(override), join(override, "campaigns/a")).findings.some((f) => f.level === "error" && f.message.includes("DEV tags")));
});

test("media validation enforces Bluesky image count and byte boundaries", () => {
  const media = Array.from({ length: 5 }, (_, i) => `  - { path: image${i}.png, kind: image, alt: Diagram }`).join("\n");
  const root = project({
    "campaigns/a/drafts/devto.md": devto("Article"),
    "campaigns/a/drafts/bluesky.md": `---\ndestination: bluesky\nevidence: [E1]\nmedia:\n${media}\n---\nPost\n`,
    ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`campaigns/a/image${i}.png`, "x"])),
  });
  const image = join(root, "campaigns/a/image0.png");
  writeFileSync(image, Buffer.alloc(2_000_000));
  let findings = checkCampaign(loadConfig(root), join(root, "campaigns/a")).findings;
  assert(findings.some((finding) => finding.message.includes("at most 4 images")));
  assert(!findings.some((finding) => finding.message.includes("exceeds limit 2000000")));
  writeFileSync(image, Buffer.alloc(2_000_001));
  findings = checkCampaign(loadConfig(root), join(root, "campaigns/a")).findings;
  assert(findings.some((finding) => finding.message.includes("exceeds limit 2000000")));
});

test("checks reject GIF media and unsupported API attachments", () => {
  const root = project({
    "market-blaster.yml": "brand: { name: Demo }\ndestinations: [bluesky, nostr]\n",
    "campaigns/a/drafts/bluesky.md": "---\ndestination: bluesky\nevidence: [E1]\nmedia:\n  - { path: animation.gif, kind: gif, alt: Animation }\n---\nPost\n",
    "campaigns/a/drafts/nostr.md": "---\ndestination: nostr\nevidence: [E1]\nmedia:\n  - { path: animation.gif, kind: image, alt: Animation }\n---\nPost\n",
    "campaigns/a/animation.gif": "gif",
  });
  const findings = checkCampaign(loadConfig(root), join(root, "campaigns/a")).findings;
  assert(findings.some((finding) => finding.destination === "bluesky" && finding.message.includes("export MP4")));
  assert(findings.some((finding) => finding.destination === "nostr" && finding.message.includes("attach by hand")));
});
