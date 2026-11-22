import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../src/config.ts";
import { githubDiscussion } from "../src/destinations/github-discussion.ts";
import { nostr } from "../src/destinations/crosspost.ts";
import { lemmy, newsletter, newsletterTargets } from "../src/destinations/handoffs.ts";
import { publishOrder } from "../src/destinations/meta.ts";
import type { Ctx, ResolvedPost } from "../src/types.ts";
import { mockFetch } from "./helpers.ts";

const config = validateConfig({ brand: { name: "Demo" }, destinations: ["github-discussion", "nostr", "lemmy", "newsletter"], githubDiscussion: { repo: "owner/project", category: "Announcements" }, lemmy: { instance: "programming.dev", community: "programming" }, newsletter: { targets: ["console-dev", "javascript-weekly", "golang-weekly", "changelog-news"] } }, ".");
const post: ResolvedPost = { destination: "github-discussion", title: "Hello", body: "Body", canonical: "https://example.com/article", contentHash: "hash" };

test("discussion creates after repository category lookup and updates by id", async () => {
  const mock = mockFetch((call) => {
    const { query } = JSON.parse(call.body);
    if (query.includes("repository(owner:")) return [200, { data: { repository: { id: "repo", discussionCategories: { nodes: [{ id: "category", name: "Announcements" }] } } } }];
    if (query.includes("createDiscussion")) return [200, { data: { createDiscussion: { discussion: { id: "discussion", url: "https://github.com/discussion" } } } }];
    return [200, { data: { updateDiscussion: { discussion: { id: "discussion", url: "https://github.com/discussion" } } } }];
  });
  const ctx: Ctx = { config, env: { GITHUB_TOKEN: "secret" }, fetch: mock.fetch, timeoutMs: 1000 };
  assert.equal((await githubDiscussion.create!(post, ctx, { stage: false })).id, "discussion");
  assert.deepEqual(JSON.parse(mock.calls[0].body).variables, { owner: "owner", name: "project" });
  assert.deepEqual(JSON.parse(mock.calls[1].body).variables.input, { repositoryId: "repo", categoryId: "category", title: "Hello", body: "Body\n\nOriginally published at https://example.com/article" });
  await githubDiscussion.update!("discussion", post, ctx, { stage: false });
  assert.match(JSON.parse(mock.calls[2].body).query, /updateDiscussion/);
  assert.equal(JSON.parse(mock.calls[2].body).variables.input.discussionId, "discussion");
});

test("nostr sends resolved text and derives URL", async () => {
  let sent = "";
  const ctx: Ctx = { config, env: { NOSTR_PRIVATE_KEY: "key" }, fetch, timeoutMs: 1000, crosspost: (id) => { assert.equal(id, "nostr"); return { post: async (text) => { sent = text; return { id: "event" }; } }; } };
  const result = await nostr.create!({ ...post, body: "resolved https://example.com" }, ctx, { stage: false });
  assert.equal(sent, "resolved https://example.com");
  assert.deepEqual(result, { id: "event", url: "https://njump.me/event" });
});

test("handoffs and ordering use configured destinations", () => {
  const ctx: Ctx = { config, env: {}, fetch, timeoutMs: 1000 };
  assert.deepEqual(lemmy.handoff!(post, ctx), { url: "https://programming.dev/c/programming", prefills: "none" });
  assert.equal(newsletter.handoff!(post, ctx).url, "https://console.dev/selection-criteria");
  assert.deepEqual(newsletterTargets(config).map((target) => target.url), ["https://console.dev/selection-criteria", "https://cooperpress.com/submit/", "https://cooperpress.com/submit/", "https://changelog.com/news/submit"]);
  assert.deepEqual(publishOrder(["lemmy", "nostr", "github-discussion", "gist", "x", "newsletter"]), ["gist", "github-discussion", "x", "nostr", "lemmy", "newsletter"]);
  assert.equal(config.nostr.relays.length, 3);
});
