import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";
import { ADAPTERS } from "../src/destinations/index.ts";
import { publishCampaign } from "../src/publisher.ts";
import { approvalHash, loadState, withStateLock } from "../src/state.ts";
import { run as approve } from "../src/commands/approve.ts";
import { run as mark } from "../src/commands/mark.ts";
import { run as status } from "../src/commands/status.ts";
import type { DestinationId } from "../src/types.ts";
import { fakeIO, mockFetch, tempProject } from "./helpers.ts";

const env = { DEV_API_KEY: "secret", MASTODON_TOKEN: "token", X_API_KEY: "key", X_API_SECRET: "secretx", X_ACCESS_TOKEN: "access", X_ACCESS_SECRET: "accesssecret" };
function setup(ids: DestinationId[], extra = "", drafts: Partial<Record<DestinationId, string>> = {}) {
  const files: Record<string, string> = {
    "market-blaster.yml": `brand:\n  name: Demo\ndestinations: [${ids.join(", ")}]\n${extra}`,
    "campaigns/test/brief.md": "## [E1] Grounded evidence",
  };
  for (const id of ids) if (id !== "hn") files[`campaigns/test/drafts/${id}.md`] = drafts[id] ?? `---\ndestination: ${id}\ntitle: Test title\nevidence: [E1]\n---\nGrounded evidence\n`;
  const root = tempProject(files);
  const config = loadConfig(root);
  return { root, config, campaign: join(root, "campaigns/test") };
}
async function approveAll(root: string) {
  const io = fakeIO({ cwd: root, isTTY: true, answers: Array(20).fill("y") });
  assert.equal(await approve(["test"], io), 0, io.text());
}
const okDev = () => [200, { id: 7, url: "https://dev.to/post" }] as [number, unknown];

test("approval gates content and dry run respects staging", async () => {
  const s = setup(["devto"], "devto:\n  publish: true\n");
  const io = fakeIO({ cwd: s.root });
  assert.equal(await approve(["test"], io), 1);
  await approveAll(s.root);
  assert.equal(await publishCampaign({ ...s, io, env, adapters: ADAPTERS, stage: true }), 0);
  assert.match(io.text(), /"published":false/);
  const path = join(s.campaign, "drafts/devto.md");
  writeFileSync(path, `${readFileSync(path, "utf8")}changed`);
  assert.equal(await publishCampaign({ ...s, io, env, adapters: ADAPTERS, yes: true }), 1);
  assert.match(io.text(), /not approved/);
});

test("DEV default stages; next run updates in place", async () => {
  const s = setup(["devto"]); await approveAll(s.root);
  const net = mockFetch(okDev); const io = fakeIO({ cwd: s.root, fetch: net.fetch });
  const opts = { ...s, io, env, adapters: ADAPTERS, yes: true };
  assert.equal(await publishCampaign(opts), 0);
  assert.equal(loadState(s.campaign).devto?.status, "staged");
  assert.equal(await publishCampaign(opts), 0);
  assert.equal(loadState(s.campaign).devto?.status, "published");
  const writes = net.calls.filter(c => c.method !== "GET");
  assert.deepEqual(writes.map(c => c.method), ["POST", "PUT"]);
  assert.equal(JSON.parse(writes[0].body).article.published, false);
  assert.equal(JSON.parse(writes[1].body).article.published, true);
});

test("update timeout keeps live URL and mark not-posted retries PUT", async () => {
  const s = setup(["devto"], "devto:\n  publish: true\n"); await approveAll(s.root);
  let fail = false;
  const net = mockFetch(c => {
    if (c.method === "PUT" && fail) { fail = false; throw new TypeError("fetch failed", { cause: { code: "UND_ERR_SOCKET" } }); }
    return okDev();
  });
  const io = fakeIO({ cwd: s.root, fetch: net.fetch }); const opts = { ...s, io, env, adapters: ADAPTERS, yes: true };
  assert.equal(await publishCampaign(opts), 0);
  const previous = loadState(s.campaign).devto!;
  const path = join(s.campaign, "drafts/devto.md");
  writeFileSync(path, `${readFileSync(path, "utf8")}Updated\n`); await approveAll(s.root); fail = true;
  assert.equal(await publishCampaign(opts), 1);
  const entry = loadState(s.campaign).devto!;
  assert.equal(entry.status, "published"); assert.equal(entry.url, previous.url); assert.equal(entry.contentHash, previous.contentHash); assert.equal(entry.lastAttempt?.status, "unknown");
  assert.equal(await publishCampaign(opts), 1);
  assert.equal(await mark(["test", "devto", "--not-posted"], io), 0);
  assert.equal(await publishCampaign(opts), 0);
  assert.deepEqual(net.calls.filter(c => c.method !== "GET").map(c => c.method), ["POST", "PUT", "PUT"]);
});

test("retries 429 with Retry-After and connection refused, but not 500", async () => {
  for (const scenario of ["429", "refused", "500"]) {
    const s = setup(["devto"], "devto:\n  publish: true\n"); await approveAll(s.root);
    let writes = 0; const waits: number[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      if (init?.method !== "POST") return Response.json({ id: 7 });
      writes++;
      if (writes === 1) {
        if (scenario === "refused") throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
        return new Response("failure", { status: Number(scenario), headers: { "retry-after": "3" } });
      }
      return Response.json({ id: 7, url: "https://dev.to/post" });
    };
    const io = fakeIO({ cwd: s.root, fetch: fetcher });
    assert.equal(await publishCampaign({ ...s, io, env, adapters: ADAPTERS, yes: true, sleep: async ms => { waits.push(ms); } }), scenario === "500" ? 1 : 0);
    assert.equal(writes, scenario === "500" ? 1 : 2);
    if (scenario === "429") assert.deepEqual(waits, [3000]);
    if (scenario === "refused") assert.deepEqual(waits, [100]);
  }
});

test("preflight credential failure prevents all writes", async () => {
  const s = setup(["devto", "mastodon"], "mastodon:\n  host: example.com\ndevto:\n  publish: true\n"); await approveAll(s.root);
  const net = mockFetch(c => c.url.includes("verify_credentials") ? [401, { error: "bad token" }] : okDev());
  const io = fakeIO({ cwd: s.root, fetch: net.fetch });
  assert.equal(await publishCampaign({ ...s, io, env, adapters: ADAPTERS, yes: true }), 1);
  assert.equal(net.calls.filter(c => c.method !== "GET").length, 0); assert.equal(loadState(s.campaign).devto?.status, undefined);
  assert.match(io.text(), /mastodon: preflight failed/);
});

test("X API publishes without verification, changed social requires force", async () => {
  const s = setup(["x"], "x:\n  api: true\n"); await approveAll(s.root);
  let posts = 0;
  const crosspost = () => ({ post: async () => { posts++; return { data: { id: String(posts) } }; }, getUrlFromResponse: () => `https://x.com/post/${posts}` });
  const io = fakeIO({ cwd: s.root }); const opts = { ...s, io, env, adapters: ADAPTERS, yes: true, crosspost };
  assert.equal(await publishCampaign(opts), 0); assert.match(io.text(), /no read check available/);
  const path = join(s.campaign, "drafts/x.md"); writeFileSync(path, `${readFileSync(path, "utf8")}changed`); await approveAll(s.root);
  assert.equal(await publishCampaign(opts), 1); assert.equal(posts, 1);
  assert.equal(await publishCampaign({ ...opts, force: true }), 0); assert.equal(posts, 2);
});

test("mark URL uses approval and status shows it", async () => {
  const s = setup(["x"]); await approveAll(s.root); const io = fakeIO({ cwd: s.root });
  assert.equal(await mark(["test", "x", "--url", "https://x.com/post/1"], io), 0);
  const entry = loadState(s.campaign).x!; assert.equal(entry.contentHash, entry.approvedHash);
  assert.equal(await status(["test"], io), 0); assert.match(io.text(), /x\tpublished\thttps:\/\/x.com\/post\/1/);
});

test("HN uses canonical title and URL without copying; staging skips other destinations", async () => {
  const s = setup(["devto", "hn", "x"], "canonicalHome: devto\ndevto:\n  publish: true\n"); await approveAll(s.root);
  const net = mockFetch(okDev); const commands: string[] = [];
  const io = fakeIO({ cwd: s.root, fetch: net.fetch, run: async cmd => { commands.push(cmd); return ""; } });
  const opts = { ...s, io, env, adapters: ADAPTERS, yes: true };
  assert.equal(await publishCampaign({ ...opts, stage: true }), 0);
  assert.match(io.text(), /x: skipped \(not staged\)/);
  assert.equal(await publishCampaign({ ...opts, open: true, only: ["devto", "hn"] }), 0);
  assert.match(io.text(), /submitlink\?u=https%3A%2F%2Fdev.to%2Fpost&t=Test%20title/);
  assert.deepEqual(commands, [process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open"]);
});

test("skipped draft does not require approval or fail", async () => {
  const s = setup(["gist"], "", { gist: "---\ndestination: gist\nskip: No runnable example\n---\n" });
  const io = fakeIO({ cwd: s.root });
  assert.equal(await publishCampaign({ ...s, io, env, adapters: ADAPTERS, yes: true }), 0);
  assert.match(io.text(), /gist: skipped \(No runnable example\)/);
});

test("concurrent publish is blocked by state lock", async () => {
  const s = setup(["devto"], "devto:\n  publish: true\n"); await approveAll(s.root);
  const gate = Promise.withResolvers<void>(); const started = Promise.withResolvers<void>();
  const net = mockFetch(async c => { if (c.method === "POST") { started.resolve(); await gate.promise; } return okDev(); });
  const io = fakeIO({ cwd: s.root, fetch: net.fetch }); const opts = { ...s, io, env, adapters: ADAPTERS, yes: true };
  const first = publishCampaign(opts); await started.promise;
  await assert.rejects(publishCampaign(opts), { name: "LockError" });
  gate.resolve(); assert.equal(await first, 0);
});


test("changing destination configuration invalidates approval", async () => {
  const s = setup(["devto"]); await approveAll(s.root);
  s.config.devto.publish = true;
  const io = fakeIO({ cwd: s.root });
  assert.equal(await publishCampaign({ ...s, io, env, adapters: ADAPTERS, yes: true }), 1);
  assert.match(io.text(), /not approved/);
});

test("switching a handoff to API requires explicit force", async () => {
  const s = setup(["x"]); await approveAll(s.root);
  const io = fakeIO({ cwd: s.root }); let posts = 0;
  const crosspost = () => ({ post: async () => { posts++; return { data: { id: "1" } }; }, getUrlFromResponse: () => "https://x.com/post/1" });
  const opts = { ...s, io, env, adapters: ADAPTERS, yes: true, crosspost };
  assert.equal(await publishCampaign(opts), 0);
  writeFileSync(join(s.root, "market-blaster.yml"), "brand:\n  name: Demo\ndestinations: [x]\nx:\n  api: true\n");
  s.config = loadConfig(s.root); await approveAll(s.root);
  assert.equal(await publishCampaign({ ...opts, config: s.config }), 1); assert.match(io.text(), /prior handoff/);
  assert.equal(await publishCampaign({ ...opts, config: s.config, force: true }), 0);
  assert.equal(posts, 1);
});

test("gateway failure is unknown and cannot be retried without mark", async () => {
  const s = setup(["devto"], "devto:\n  publish: true\n"); await approveAll(s.root);
  const net = mockFetch(c => c.method === "POST" ? [503, { error: "gateway" }] : okDev());
  const io = fakeIO({ cwd: s.root, fetch: net.fetch });
  const opts = { ...s, io, env, adapters: ADAPTERS, yes: true };
  assert.equal(await publishCampaign(opts), 1); assert.equal(loadState(s.campaign).devto?.status, "unknown");
  assert.equal(await publishCampaign(opts), 1); assert.equal(net.calls.filter(c => c.method === "POST").length, 1);
});

test("approval includes discussion settings and invalid configuration is rejected", () => {
  const s = setup(["github-discussion"], "githubDiscussion:\n  repo: owner/repo\n  category: General\n");
  const draft = { destination: "github-discussion" as const, title: "T", body: "B", evidence: [], path: "" };
  const old = approvalHash(draft, s.config);
  s.config.githubDiscussion.category = "News";
  assert.notEqual(approvalHash(draft, s.config), old);
  assert.throws(() => setup(["newsletter"]), /newsletter.targets/);
  assert.throws(() => setup(["lemmy"], "lemmy:\n  instance: https://example.com\n"), /bare hostname/);
  assert.throws(() => setup(["github-discussion"]), /githubDiscussion/);
});

test("empty and invalid lock files are stale", async () => {
  const s = setup(["devto"]);
  for (const pid of ["", "invalid"]) {
    writeFileSync(join(s.campaign, "state.json.lock"), pid);
    assert.equal(await withStateLock(s.campaign, async () => 42), 42);
  }
});

test("newsletter prints each distinct target", async () => {
  const s = setup(["newsletter"], "newsletter:\n  targets: [console-dev, javascript-weekly, golang-weekly]\n");
  await approveAll(s.root);
  const io = fakeIO({ cwd: s.root });
  assert.equal(await publishCampaign({ ...s, io, env, adapters: ADAPTERS, yes: true }), 0);
  assert.match(io.text(), /console\.dev/);
  assert.equal((io.text().match(/https:\/\/cooperpress\.com\/submit\//g) ?? []).length, 1);
});

test("DEV invalid tags are reported rather than thrown in dry run", async () => {
  const s = setup(["devto"], "", { devto: "---\ndestination: devto\ntitle: Test\ntags: [Bad-tag]\nevidence: [E1]\n---\nGrounded evidence\n" });
  const io = fakeIO({ cwd: s.root });
  assert.equal(await publishCampaign({ ...s, io, env, adapters: ADAPTERS }), 1);
  assert.match(io.text(), /devto: error:.*tags/i);
});