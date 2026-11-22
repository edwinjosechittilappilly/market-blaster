import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateConfig } from "../src/config.ts";
import { devto } from "../src/destinations/devto.ts";
import { hn, xIntent } from "../src/destinations/handoffs.ts";
import { parseDraft } from "../src/drafts.ts";
import { publishCampaign } from "../src/publisher.ts";
import { contentHash, loadState, saveState } from "../src/state.ts";
import { HttpError, type Destination, type DestinationId, type Env } from "../src/types.ts";
import { run as approve } from "../src/commands/approve.ts";
import { run as mark } from "../src/commands/mark.ts";
import { fakeIO, mockFetch, tempProject } from "./helpers.ts";

function setup(ids: DestinationId[], bodies: Partial<Record<DestinationId, string>> = {}) {
  const files: Record<string, string> = { "market-blaster.yml": `brand:\n  name: Demo\ndestinations: [${ids.join(", ")}]\n`, "campaigns/test/brief.md": "[E1] Grounded evidence" };
  for (const id of ids) files[`campaigns/test/drafts/${id}.md`] = `---\ndestination: ${id}\ntitle: Test title\nevidence: [E1]\n---\n${bodies[id] ?? "Grounded evidence"}\n`;
  const root = tempProject(files);
  const campaign = join(root, "campaigns/test");
  const config = validateConfig({ brand: { name: "Demo" }, destinations: ids, devto: { publish: true, tags: ["one", "two", "three", "four", "five"] }, mastodon: { host: "example.com" } }, root);
  const state = Object.fromEntries(ids.map((id) => { const path = join(campaign, `drafts/${id}.md`); return [id, { approvedHash: contentHash(parseDraft(path, readFileSync(path, "utf8"))) }]; }));
  return { root, campaign, config, state };
}
function fakeAdapter(id: DestinationId, create: NonNullable<Destination["create"]>): Destination {
  return { id, kind: id === "devto" ? "article" : "social", env: [], limit: () => null, payload: (post) => post, verify: async () => {}, create };
}
const env: Env = { DEV_API_KEY: "secret-value", MASTODON_TOKEN: "secret-value", BLUESKY_IDENTIFIER: "user", BLUESKY_APP_PASSWORD: "password" };
const adapters = (items: Partial<Record<DestinationId, Destination>>) => items as Record<DestinationId, Destination>;

test("dry run leaves state unchanged and performs no fetch", async () => {
  const s = setup(["devto"]); saveState(s.campaign, s.state); const before = readFileSync(join(s.campaign, "state.json"), "utf8");
  const net = mockFetch(() => { throw new Error("network called"); }); const io = fakeIO({ cwd: s.root, fetch: net.fetch });
  assert.equal(await publishCampaign({ ...s, env, io, adapters: adapters({ devto }) }), 0);
  assert.equal(net.calls.length, 0); assert.equal(readFileSync(join(s.campaign, "state.json"), "utf8"), before); assert.match(io.text(), /devto: api/);
});
test("approval requires TTY and edited drafts cannot publish", async () => {
  const s = setup(["devto"]); const io = fakeIO({ cwd: s.root });
  assert.equal(await approve(["test"], io), 1); assert.equal(existsSync(join(s.campaign, "state.json")), false);
  saveState(s.campaign, s.state); const path = join(s.campaign, "drafts/devto.md"); writeFileSync(path, `${readFileSync(path, "utf8")}changed`);
  assert.equal(await publishCampaign({ ...s, env, io, adapters: adapters({ devto }), yes: true }), 1); assert.match(io.text(), /not approved/);
});
test("DEV stages then updates same article with tags and canonical", async () => {
  const s = setup(["devto"]); s.config.canonicalHome = "https://example.com/home"; saveState(s.campaign, s.state);
  const net = mockFetch(() => [200, { id: 7, url: "https://dev.to/post" }]); const io = fakeIO({ cwd: s.root, fetch: net.fetch });
  assert.equal(await publishCampaign({ ...s, env, io, adapters: adapters({ devto }), yes: true, stage: true }), 0);
  assert.equal(loadState(s.campaign).devto?.status, "staged");
  assert.equal(await publishCampaign({ ...s, env, io, adapters: adapters({ devto }), yes: true }), 0);
  const writes = net.calls.filter((c) => c.method !== "GET"); assert.deepEqual(writes.map((c) => c.method), ["POST", "PUT"]); assert.match(writes[1].url, /articles\/7$/);
  const first = JSON.parse(writes[0].body).article; const second = JSON.parse(writes[1].body).article;
  assert.equal(first.published, false); assert.equal(second.published, true); assert.equal(second.canonical_url, "https://example.com/home"); assert.deepEqual(second.tags, ["one", "two", "three", "four"]);
});
test("partial failure blocks dependencies, redacts secrets, and retries only failed posts", async () => {
  const s = setup(["devto", "bluesky", "mastodon"], { bluesky: "Read {{url:devto}}" }); saveState(s.campaign, s.state);
  let devCalls = 0, blueCalls = 0, mastCalls = 0;
  const dev = fakeAdapter("devto", async () => { devCalls++; if (devCalls === 1) throw new HttpError(500, "secret-value failed"); return { id: "1", url: "https://example.com/article" }; });
  const blue = fakeAdapter("bluesky", async (post) => { blueCalls++; assert.match(post.body, /https:\/\/example.com\/article/); return { id: "2", url: "https://example.com/blue" }; });
  const mast = fakeAdapter("mastodon", async () => { mastCalls++; return { id: "3", url: "https://example.com/mast" }; });
  const io = fakeIO({ cwd: s.root }); const options = { ...s, env, io, adapters: adapters({ devto: dev, bluesky: blue, mastodon: mast }), yes: true };
  assert.equal(await publishCampaign(options), 1); assert.equal(loadState(s.campaign).bluesky?.status, "blocked"); assert.equal(mastCalls, 1); assert.doesNotMatch(readFileSync(join(s.campaign, "state.json"), "utf8"), /secret-value/);
  assert.equal(await publishCampaign(options), 0); assert.equal(devCalls, 2); assert.equal(blueCalls, 1); assert.equal(mastCalls, 1);
});
test("timeout is unknown until marked not posted", async () => {
  const s = setup(["bluesky"]); saveState(s.campaign, s.state); let calls = 0;
  const blue = fakeAdapter("bluesky", async () => { calls++; if (calls === 1) throw new DOMException("timed out", "TimeoutError"); return { id: "1", url: "https://example.com/post" }; });
  const io = fakeIO({ cwd: s.root }); const options = { ...s, env, io, adapters: adapters({ bluesky: blue }), yes: true };
  assert.equal(await publishCampaign(options), 1); assert.equal(loadState(s.campaign).bluesky?.status, "unknown"); assert.equal(await publishCampaign(options), 1); assert.equal(calls, 1);
  assert.equal(await mark(["test", "bluesky", "--not-posted"], io), 0); assert.equal(await publishCampaign(options), 0); assert.equal(calls, 2);
});
test("handoff URLs encode link and text", () => {
  const s = setup(["hn"]); const ctx = { config: s.config, env: {}, fetch, timeoutMs: 1000 }; const post = { destination: "hn" as const, title: "Title & more", body: "https://example.com/a?x=1&y=2", contentHash: "h" };
  assert.equal(hn.handoff!(post, ctx).url, "https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1%26y%3D2&t=Title%20%26%20more");
  assert.equal(xIntent("hello & bye"), "https://x.com/intent/post?text=hello%20%26%20bye");
});
test("mastodon failure does not prevent later handoff", async () => {
  const s = setup(["mastodon", "x"]); saveState(s.campaign, s.state);
  const mastodon = fakeAdapter("mastodon", async () => { throw new HttpError(500, "mastodon 500: down"); });
  const x: Destination = { ...fakeAdapter("x", async () => { throw new Error("unexpected API"); }), handoff: (post) => ({ url: xIntent(post.body), prefills: "full" }) };
  const io = fakeIO({ cwd: s.root });
  assert.equal(await publishCampaign({ ...s, env: { ...env, X_API_KEY: "a", X_API_SECRET: "b", X_ACCESS_TOKEN: "c", X_ACCESS_SECRET: "d" }, io, adapters: adapters({ mastodon, x }), yes: true }), 1);
  assert.equal(loadState(s.campaign).mastodon?.status, "failed"); assert.equal(loadState(s.campaign).x?.status, "handoff"); assert.match(io.text(), /https:\/\/x.com\/intent\/post/);
});
