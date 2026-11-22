import assert from "node:assert/strict";
import { test } from "node:test";
import { run as auth } from "../src/commands/auth.ts";
import { run as doctor } from "../src/commands/doctor.ts";
import { loadEnvWithSources } from "../src/env.ts";
import { keychainGet, keychainSet } from "../src/keychain.ts";
import { fakeIO, tempProject } from "./helpers.ts";

test("environment precedence and dotenv comments", () => {
  const root = tempProject({ ".env": 'DEV_API_KEY="file" # comment\nBLUESKY_IDENTIFIER= name  \n' });
  const { env, sources } = loadEnvWithSources(root, { DEV_API_KEY: "shell" }, (key) => ({ DEV_API_KEY: "kc", BLUESKY_IDENTIFIER: "kc", MASTODON_TOKEN: "kc" })[key]);
  assert.equal(env.DEV_API_KEY, "shell");
  assert.equal(env.BLUESKY_IDENTIFIER, "name");
  assert.equal(env.MASTODON_TOKEN, "kc");
  assert.equal(sources.MASTODON_TOKEN, "keychain");
  assert.equal(loadEnvWithSources(root, {}, () => undefined).env.DEV_API_KEY, "file");
});

test("keychain errors never expose secret and list reports only sources", async () => {
  assert.throws(() => keychainSet("DEV_API_KEY", "very-secret", () => { throw Error("very-secret"); }, "darwin"), (err: Error) => !err.message.includes("very-secret"));
  let stored: string[] = [];
  let input = "";
  keychainSet("DEV_API_KEY", "very-secret", (args, data) => { stored = args; input = data ?? ""; return ""; }, "darwin");
  assert.deepEqual(stored, ["-i"]);
  assert.doesNotMatch(stored.join(" "), /very-secret/);
  assert.match(input, /-T "" -X 766572792d736563726574/);
  assert.throws(() => keychainGet("DEV_API_KEY", undefined, "darwin"), /inject a Keychain runner/);
  assert.throws(() => keychainSet("DEV_API_KEY", "x".repeat(4096), () => { throw new Error("must not run"); }, "darwin"), /credential is too long/);
  assert.equal(keychainGet("DEV_API_KEY", () => "secret\n", "darwin"), "secret");
  const io = fakeIO({ cwd: tempProject(), env: { DEV_API_KEY: "very-secret" } });
  await auth(["list"], io, { get: () => "another-secret" });
  assert.match(io.text(), /DEV_API_KEY: shell/);
  assert.doesNotMatch(io.text(), /very-secret|another-secret/);
  await assert.rejects(auth(["set", "BAD"], io, { input: async () => "x" }), /Unknown credential key; known: .*DEV_API_KEY/);
  await auth(["set", "DEV_API_KEY", "--stdin"], io, { input: async () => "very-secret", set: (key, value) => keychainSet(key, value, (args, data) => { stored = args; input = data ?? ""; return ""; }, "darwin") });
  assert.deepEqual(stored, ["-i"]);
  assert.match(input, /766572792d736563726574/);
});

test("LinkedIn loopback exchanges code and stores token", async () => {
  const saved: Record<string, string> = {};
  const root = tempProject({ ".env": "LINKEDIN_TOKEN_ISSUED=old\n" });
  const io = fakeIO({ cwd: root, env: { LINKEDIN_CLIENT_ID: "id", LINKEDIN_CLIENT_SECRET: "secret", LINKEDIN_ACCESS_TOKEN: "old" },
    run: async (_cmd, args) => {
      const url = new URL(args[0]);
      assert.match(io.text(), /https:\/\/www\.linkedin\.com\/oauth\/v2\/authorization/);
      void (async () => {
        assert.equal(url.searchParams.get("scope"), "openid profile w_member_social");
        const callback = new URL(url.searchParams.get("redirect_uri")!);
        callback.searchParams.set("state", "wrong");
        callback.searchParams.set("code", "abc");
        assert.equal((await fetch(callback)).status, 401);
        callback.searchParams.set("state", url.searchParams.get("state")!);
        assert.equal((await fetch(callback)).status, 200);
      })();
      throw new Error("opener unavailable");
    },
    fetch: (async (url, init) => {
      assert.equal(url, "https://www.linkedin.com/oauth/v2/accessToken");
      const form = new URLSearchParams(String(init?.body));
      assert.equal(form.get("code"), "abc");
      assert.equal(form.get("client_secret"), "secret");
      return Response.json({ access_token: "token", expires_in: 3600 });
    }) as typeof fetch,
  });
  await auth(["linkedin"], io, { get: () => undefined, set: (key, value) => { saved[key] = value; }, platform: "darwin", now: () => new Date("2026-01-01T00:00:00Z") });
  assert.deepEqual(saved, { LINKEDIN_ACCESS_TOKEN: "token", LINKEDIN_TOKEN_ISSUED: "2026-01-01T00:00:00.000Z" });
  assert.match(io.text(), /2026-01-01T01:00:00.000Z/);
  assert.match(io.text(), /LINKEDIN_ACCESS_TOKEN is overridden by shell/);
  assert.match(io.text(), /LINKEDIN_TOKEN_ISSUED is overridden by \.env/);
  assert.match(io.text(), /Could not open browser/);
});

test("doctor warns about old LinkedIn tokens", async () => {
  const cwd = tempProject({ "market-blaster.yml": "brand:\n  name: Test\ndestinations: [linkedin]\nlinkedin:\n  api: true\n" });
  const io = fakeIO({ cwd, env: { LINKEDIN_ACCESS_TOKEN: "token", LINKEDIN_TOKEN_ISSUED: new Date(Date.now() - 51 * 86_400_000).toISOString() } });
  await doctor([], io);
  assert.match(io.text(), /run mblast auth linkedin/);
  assert.match(io.text(), /LINKEDIN_ACCESS_TOKEN=shell/);
});

test("doctor uses its injected Keychain lookup", async () => {
  const cwd = tempProject({ "market-blaster.yml": "brand: { name: Test }\ndestinations: [devto]\n" });
  const io = fakeIO({ cwd, keychain: (key) => key === "DEV_API_KEY" ? "fake-token" : undefined });
  assert.equal(await doctor([], io), 0);
  assert.match(io.text(), /DEV_API_KEY=keychain/);
});
