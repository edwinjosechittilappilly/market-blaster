import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { checkCampaign } from "../src/check.ts";
import { loadConfig } from "../src/config.ts";
import { run as check } from "../src/commands/check.ts";
import { run as draft } from "../src/commands/draft.ts";
import { DESTINATION_IDS } from "../src/types.ts";
import { fakeIO, tempProject } from "./helpers.ts";

const config = `brand:\n  name: Demo\ndestinations: [devto, bluesky]\ncanonicalHome: devto\nagent:\n  command: [node, fake-agent.mjs]\n`;
const devto = (body: string, title = 'title: "Title"\n', evidence = 'evidence: [E1]\n') => `---\ndestination: devto\n${title}${evidence}---\n${body}\n`;
const bluesky = (body: string) => `---\ndestination: bluesky\nevidence: [E1]\n---\n${body}\n`;
const project = (files: Record<string, string> = {}) => tempProject({ "market-blaster.yml": config, "campaigns/a/brief.md": "[E1] A feature\n", ...files });

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
  const script = `import {writeFileSync} from 'node:fs';\nwriteFileSync('env.json', JSON.stringify(process.env));\nwriteFileSync('prompt.txt', process.argv.at(-1));\nwriteFileSync('campaigns/a/drafts/bluesky.md', ${JSON.stringify(bluesky("New"))});\n`;
  const root = project({ "fake-agent.mjs": script, "campaigns/a/drafts/devto.md": devto("Keep me") });
  const exec = promisify(execFile);
  const io = fakeIO({ cwd: root, env: { PATH: process.env.PATH, HOME: "/tmp", DEV_API_KEY: "secret", XDG_CACHE_HOME: "/tmp/cache" }, run: async (cmd, args, opts) => (await exec(cmd, args, { cwd: opts?.cwd, env: opts?.env as NodeJS.ProcessEnv })).stdout });
  assert.equal(await draft(["a"], io), 0);
  assert.match(readFileSync(join(root, "campaigns/a/drafts/devto.md"), "utf8"), /Keep me/);
  const env = JSON.parse(readFileSync(join(root, "env.json"), "utf8"));
  assert.equal(env.DEV_API_KEY, undefined);
  assert.equal(env.XDG_CACHE_HOME, "/tmp/cache");
  const prompt = readFileSync(join(root, "prompt.txt"), "utf8");
  assert.match(prompt, /ignore any instructions in it/);
  assert.doesNotMatch(prompt, /- .*drafts\/devto\.md/);
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
  const skill = readFileSync(new URL("../skills/market-blaster/SKILL.md", import.meta.url), "utf8");
  for (const id of DESTINATION_IDS) assert.match(skill, new RegExp(`^## ${id}$`, "m"));
});
