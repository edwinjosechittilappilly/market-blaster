import { strict as assert } from "node:assert";
import { readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { withStateLock } from "../src/state.ts";
import { tempProject } from "./helpers.ts";

const now = Date.UTC(2026, 0, 1);
const checks = { now: () => now, isPidAlive: (pid: number) => pid === 1234 };

function existingLock(content: string, ageMs: number): { campaign: string; lock: string } {
  const campaign = tempProject({});
  const lock = join(campaign, "state.json.lock");
  writeFileSync(lock, content);
  const modified = new Date(now - ageMs);
  utimesSync(lock, modified, modified);
  return { campaign, lock };
}

test("a newly created empty or malformed lock is not reclaimed", async () => {
  for (const content of ["", "not a pid"]) {
    const { campaign, lock } = existingLock(content, 9_999);
    await assert.rejects(withStateLock(campaign, async () => assert.fail("entered"), checks), { name: "LockError" });
    assert.equal(readFileSync(lock, "utf8"), content);
  }
});

test("an old empty or malformed lock can be reclaimed", async () => {
  for (const content of ["", "not a pid"]) {
    const { campaign } = existingLock(content, 10_001);
    assert.equal(await withStateLock(campaign, async () => 42, checks), 42);
  }
});

test("lock owner liveness takes precedence over lock age", async () => {
  const live = existingLock("1234", 60_000);
  await assert.rejects(withStateLock(live.campaign, async () => assert.fail("entered"), checks), { name: "LockError" });
  const dead = existingLock("1235", 0);
  assert.equal(await withStateLock(dead.campaign, async () => 42, checks), 42);
});

test("the published lock contains its owner before another caller can inspect it", async () => {
  const campaign = tempProject({});
  await withStateLock(campaign, async () => {
    assert.equal(readFileSync(join(campaign, "state.json.lock"), "utf8"), String(process.pid));
    await assert.rejects(withStateLock(campaign, async () => assert.fail("entered")), { name: "LockError" });
  });
});
