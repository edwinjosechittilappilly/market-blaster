import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { run as init } from "../src/commands/init.ts";
import { run as doctor } from "../src/commands/doctor.ts";
import { run as installSkill, SKILL_SOURCE } from "../src/commands/install-skill.ts";
import { loadConfig, validateConfig } from "../src/config.ts";
import { modeOf } from "../src/destinations/mode.ts";
import { loadEnv, redact } from "../src/env.ts";
import { UserError } from "../src/types.ts";
import { fakeIO, tempProject } from "./helpers.ts";

test("config rejects an unknown destination by name", () => {
  assert.throws(
    () => validateConfig({ brand: { name: "x" }, destinations: ["devto", "myspace"] }, "/tmp"),
    (err: Error) => err instanceof UserError && err.message.includes("myspace"),
  );
});

test("config requires brand.name", () => {
  assert.throws(() => validateConfig({ destinations: ["devto"] }, "/tmp"), /brand\.name is required/);
});

test("config rejects a canonicalHome that cannot carry a canonical URL", () => {
  assert.throws(
    () => validateConfig({ brand: { name: "x" }, destinations: ["gist"], canonicalHome: "gist" }, "/tmp"),
    /canonicalHome/,
  );
  const ok = validateConfig(
    { brand: { name: "x" }, destinations: ["gist"], canonicalHome: "https://blog.example/post" },
    "/tmp",
  );
  assert.equal(ok.canonicalHome, "https://blog.example/post");
});

test("config is found from a subdirectory and gets defaults", () => {
  const dir = tempProject({ "market-blaster.yml": "brand: {name: Demo}\ndestinations: [devto]\n", "sub/x.txt": "" });
  const config = loadConfig(join(dir, "sub"));
  assert.equal(config.root, dir);
  assert.equal(config.campaignsDir, "campaigns");
  assert.deepEqual(config.agent.command, ["omp", "-p"]);
});

test("shell environment wins over .env, and .env fills the gaps", () => {
  const dir = tempProject({ ".env": "DEV_API_KEY=from-file\nexport MASTODON_TOKEN='tok # not a comment'\n" });
  const env = loadEnv(dir, { DEV_API_KEY: "from-shell" });
  assert.equal(env.DEV_API_KEY, "from-shell");
  assert.equal(env.MASTODON_TOKEN, "tok # not a comment");
});

test("redact removes credential values", () => {
  assert.equal(redact("bad key abcd1234 rejected", { DEV_API_KEY: "abcd1234" }, ["DEV_API_KEY"]), "bad key *** rejected");
});

test("init writes config, .env.example and ignores .env; keeps an existing config", async () => {
  const dir = tempProject({});
  const io = fakeIO({ cwd: dir });
  assert.equal(await init([], io), 0);
  assert.ok(existsSync(join(dir, "market-blaster.yml")));
  assert.match(readFileSync(join(dir, ".env.example"), "utf8"), /DEV_API_KEY=/);
  assert.match(readFileSync(join(dir, ".gitignore"), "utf8"), /^\.env$/m);

  writeFileSync(join(dir, "market-blaster.yml"), "brand: {name: Mine}\ndestinations: [devto]\n");
  const again = fakeIO({ cwd: dir });
  await init([], again);
  assert.equal(readFileSync(join(dir, "market-blaster.yml"), "utf8"), "brand: {name: Mine}\ndestinations: [devto]\n");
  assert.match(again.text(), /kept existing/);
  assert.equal(readFileSync(join(dir, ".gitignore"), "utf8").match(/^\.env$/gm)?.length, 1);
});

test("starter config written by init is valid", async () => {
  const dir = tempProject({});
  await init([], fakeIO({ cwd: dir }));
  const config = loadConfig(dir);
  assert.ok(config.destinations.includes("devto"));
});

test("mode: api with credentials, handoff for opt-in APIs and handoff-only, missing otherwise", () => {
  const config = validateConfig(
    { brand: { name: "x" }, destinations: ["devto", "x", "hn", "bluesky"], mastodon: {} },
    "/tmp",
  );
  assert.equal(modeOf("devto", config, { DEV_API_KEY: "k" }).mode, "api");
  const x = modeOf("x", config, {});
  assert.equal(x.mode, "handoff");
  assert.ok(x.missing.includes("X_API_KEY"));
  const xWithKeys = modeOf("x", config, { X_API_KEY: "a", X_API_SECRET: "b", X_ACCESS_TOKEN: "c", X_ACCESS_SECRET: "d" });
  assert.equal(xWithKeys.mode, "handoff");
  assert.match(xWithKeys.note ?? "", /x\.api: true/);
  assert.equal(modeOf("hn", config, {}).mode, "handoff");
  assert.deepEqual(modeOf("bluesky", config, {}).missing, ["BLUESKY_IDENTIFIER", "BLUESKY_APP_PASSWORD"]);
  assert.equal(modeOf("bluesky", config, {}).mode, "missing");
});

test("install-skill links into both skill dirs and never replaces a real directory", async () => {
  const home = tempProject({});
  mkdirSync(join(home, ".claude/skills/market-blaster"), { recursive: true });
  const io = fakeIO({ cwd: home, env: { HOME: home } });
  assert.equal(await installSkill([], io), 1);
  const agentsLink = join(home, ".agents/skills/market-blaster");
  assert.ok(lstatSync(agentsLink).isSymbolicLink());
  assert.equal(readlinkSync(agentsLink), SKILL_SOURCE);
  assert.ok(!lstatSync(join(home, ".claude/skills/market-blaster")).isSymbolicLink());
  assert.match(io.text(), /skipped .*\.claude/);
});

test("doctor shows api for configured destinations and handoff with missing variables for X", async () => {
  const dir = tempProject();
  const io = fakeIO({
    cwd: dir,
    env: { DEV_API_KEY: "dev-key-123" },
    run: async () => {
      throw new Error("gh not logged in");
    },
  });
  assert.equal(await doctor([], io), 1, "bluesky has no credentials and no handoff, so doctor fails");
  const text = io.text();
  assert.match(text, /^devto\s+api\b/m);
  assert.match(text, /^x\s+handoff\b.*X_API_KEY/m);
  assert.match(text, /^bluesky\s+missing\b.*BLUESKY_APP_PASSWORD/m);
  assert.ok(!text.includes("dev-key-123"));
});
