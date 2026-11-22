import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
