import assert from "node:assert/strict";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { main } from "../src/cli.ts";
import { loadConfig } from "../src/config.ts";
import { loadDrafts } from "../src/drafts.ts";
import { approvalHash, saveState } from "../src/state.ts";
import { fakeIO, tempProject } from "./helpers.ts";

function project() {
  const cwd = tempProject({
    "market-blaster.yml": "brand:\n  name: Demo\ndestinations: [devto, hn, reddit, threads]\ncanonicalHome: devto\nreddit:\n  subreddit: programming\n",
    "campaigns/demo/brief.md": "## [E1] Evidence\nDetails\n",
    "campaigns/demo/drafts/devto.md": "---\ndestination: devto\ntitle: 'Show HN: Demo'\nevidence: [E1]\n---\nArticle\n",
    "campaigns/demo/drafts/reddit.md": "---\ndestination: reddit\ntitle: Discussion\nevidence: [E1]\n---\nTalking points\n",
    "campaigns/demo/drafts/threads.md": "---\ndestination: threads\nevidence: [E1]\n---\nSee {{url:devto}}\n",
  });
  const campaign = join(cwd, "campaigns/demo");
  const drafts = loadDrafts(campaign);
  saveState(campaign, { devto: { status: "published", url: "https://dev.to/demo/post", title: "Show HN: Demo" }, reddit: { approvedHash: approvalHash(drafts.get("reddit")!, loadConfig(cwd)) }, threads: { approvedHash: approvalHash(drafts.get("threads")!, loadConfig(cwd)) } });
  return { cwd, campaign };
}

test("assist requires a terminal", async () => {
  const { cwd } = project(); const io = fakeIO({ cwd });
  assert.equal(await main(["publish", "demo", "--assist"], io), 1);
  assert.match(io.text(), /interactive terminal/);
});

test("HN displays title and canonical URL without copying", async () => {
  const { cwd } = project(); const calls: string[] = [];
  const io = fakeIO({ cwd, isTTY: true, answers: [""], run: async (cmd) => { calls.push(cmd); return ""; } });
  assert.equal(await main(["publish", "demo", "--assist", "--only", "hn"], io), 0);
  assert.match(io.text(), /Show HN: Demo/); assert.match(io.text(), /https:\/\/dev.to\/demo\/post/);
  assert.match(io.text(), /HN forbids generated text and automated posting/);
  assert.ok(!calls.some((cmd) => ["pbcopy", "xclip", "clip"].includes(cmd)));
});

test("HN assist falls back to the home draft for older published state", async () => {
  const { cwd, campaign } = project();
  saveState(campaign, { devto: { status: "published", url: "https://dev.to/demo/post" } });
  const io = fakeIO({ cwd, isTTY: true, answers: [""], run: async () => "" });
  assert.equal(await main(["publish", "demo", "--assist", "--only", "hn"], io), 0);
  assert.match(io.text(), /title: Show HN: Demo/);
  assert.match(io.text(), /URL: https:\/\/dev.to\/demo\/post/);
});

test("HN assist reports a missing destination home title even when hn.title is configured", async () => {
  const { cwd, campaign } = project();
  writeFileSync(join(cwd, "market-blaster.yml"), "brand: { name: Demo }\ndestinations: [devto, hn]\ncanonicalHome: devto\nhn:\n  title: Human title\n");
  unlinkSync(join(campaign, "drafts/devto.md"));
  saveState(campaign, { devto: { status: "published", url: "https://dev.to/demo/post" } });
  const io = fakeIO({ cwd, isTTY: true, answers: [""], run: async () => "" });
  assert.equal(await main(["publish", "demo", "--assist", "--only", "hn"], io), 1);
  assert.match(io.text(), /set a title in the home draft/);
});

test("marking the canonical home records its title for a later HN publish", async () => {
  const { cwd, campaign } = project();
  saveState(campaign, {});
  const mark = fakeIO({ cwd });
  assert.equal(await main(["mark", "demo", "devto", "--url", "https://dev.to/demo/post"], mark), 0);
  const state = JSON.parse(readFileSync(join(campaign, "state.json"), "utf8"));
  assert.equal(state.devto.title, "Show HN: Demo");
  const publish = fakeIO({ cwd });
  assert.equal(await main(["publish", "demo", "--yes", "--only", "hn"], publish), 0);
  assert.match(publish.text(), /hn\s+handoff/);
  assert.match(publish.text(), /Show(?:\+|%20)HN/);
});

test("assist refuses an unapproved outline without opening or copying it", async () => {
  const { cwd, campaign } = project();
  saveState(campaign, { devto: { status: "published", url: "https://dev.to/demo/post", title: "Show HN: Demo" } });
  const calls: string[] = [];
  const io = fakeIO({ cwd, isTTY: true, run: async (cmd) => { calls.push(cmd); return ""; } });
  assert.equal(await main(["publish", "demo", "--assist", "--only", "reddit"], io), 1);
  assert.match(io.text(), /reddit: refused: draft is not approved or has changed/);
  assert.doesNotMatch(io.text(), /Talking points/);
  assert.deepEqual(calls, []);
});

test("outline is not copied", async () => {
  const { cwd } = project(); const calls: string[] = [];
  const io = fakeIO({ cwd, isTTY: true, answers: [""], run: async (cmd) => { calls.push(cmd); return ""; } });
  assert.equal(await main(["publish", "demo", "--assist", "--only", "reddit"], io), 0);
  assert.match(io.text(), /Talking points/); assert.match(io.text(), /write this yourself; nothing copied/);
  assert.ok(!calls.some((cmd) => ["pbcopy", "xclip", "clip"].includes(cmd)));
});

test("draft copies resolved text, rejects wrong hosts and records a valid permalink", async () => {
  const { cwd, campaign } = project(); const inputs: string[] = [];
  const io = fakeIO({ cwd, isTTY: true, answers: ["https://example.com/post", "https://www.threads.net/@demo/post/123"], run: async (_cmd, _args, opts) => { if (opts?.input !== undefined) inputs.push(opts.input); return ""; } });
  assert.equal(await main(["publish", "demo", "--assist", "--only", "threads"], io), 0);
  assert.deepEqual(inputs, ["See https://dev.to/demo/post"]); assert.match(io.text(), /invalid permalink host/);
  const state = JSON.parse(readFileSync(join(campaign, "state.json"), "utf8"));
  assert.equal(state.threads.status, "published"); assert.equal(state.threads.url, "https://www.threads.net/@demo/post/123");
  assert.equal(state.threads.contentHash, state.threads.approvedHash);
});

test("stop leaves current handoff and does not visit later destinations", async () => {
  const { cwd, campaign } = project();
  const io = fakeIO({ cwd, isTTY: true, answers: ["s"], run: async () => "" });
  assert.equal(await main(["publish", "demo", "--assist", "--only", "hn,reddit"], io), 0);
  const state = JSON.parse(readFileSync(join(campaign, "state.json"), "utf8"));
  assert.equal(state.hn.status, "handoff"); assert.equal(state.reddit.status, undefined);
});

test("launch records and lists a project listing", async () => {
  const { cwd } = project(); const io = fakeIO({ cwd });
  assert.equal(await main(["launch", "--mark", "devhunt", "--url", "https://devhunt.org/tool/demo"], io), 0);
  const list = fakeIO({ cwd }); assert.equal(await main(["launch"], list), 0);
  assert.match(list.text(), /DevHunt: listed https:\/\/devhunt.org\/tool\/demo/);
  assert.match(list.text(), /AlternativeTo: todo/);
});
