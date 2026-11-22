import { execFile, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/commands/brief.ts";
import { UserError } from "../src/types.ts";
import { BASIC_CONFIG, fakeIO, tempProject } from "./helpers.ts";

const exec = promisify(execFile);

function repository(lines = 1) {
  const cwd = tempProject({ "market-blaster.yml": BASIC_CONFIG, "README.md": "Before\n" });
  const git = (...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
  git("init", "-q");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("add", "README.md");
  git("commit", "-q", "-m", "Initial");
  const base = git("rev-parse", "HEAD");
  writeFileSync(join(cwd, "README.md"), `Before\n${Array.from({ length: lines }, (_, i) => `New line ${i}`).join("\n")}\n`);
  git("add", "README.md");
  git("commit", "-q", "-m", "Add feature", "-m", "Useful commit body");
  return { cwd, range: `${base}..HEAD` };
}

function ioFor(cwd: string, gh?: () => Promise<string>) {
  return fakeIO({ cwd, run: async (cmd, args, opts) => {
    if (cmd === "gh") return gh ? gh() : Promise.reject(new Error("gh unavailable"));
    const result = await exec(cmd, args, { cwd: opts?.cwd, maxBuffer: 64 * 1024 * 1024 });
    return result.stdout;
  } });
}

test("collects anchored git evidence and protects an existing brief", async () => {
  const { cwd, range } = repository();
  const io = ioFor(cwd);
  assert.equal(await run(["feature", "--range", range], io), 0);
  const path = join(cwd, "campaigns/feature/brief.md");
  const text = readFileSync(path, "utf8");
  assert.match(text, /## \[E1\] Repository/);
  assert.match(text, /## \[E2\] Commits[\s\S]*Add feature[\s\S]*Useful commit body/);
  assert.match(text, /## \[E3\] Changed files[\s\S]*README\.md/);
  assert.match(text, /## \[E4\] Diff: README\.md[\s\S]*\+New line 0/);
  assert.match(text, /## Notes from the author/);
  assert.match(io.text(), /4 evidence anchors/);
  await assert.rejects(run(["feature", "--range", range], io), (err: Error) => err instanceof UserError && /--force/.test(err.message));
  assert.equal(readFileSync(path, "utf8"), text);
  assert.equal(await run(["feature", "--range", range, "--force"], io), 0);
});

test("caps all diff lines and reports the omitted count", async () => {
  const { cwd, range } = repository(500);
  const io = ioFor(cwd);
  await run(["large", "--range", range], io);
  const text = readFileSync(join(cwd, "campaigns/large/brief.md"), "utf8");
  const diff = /```diff\n([\s\S]*?)\n```/.exec(text)?.[1];
  assert.ok(diff);
  assert.equal(diff.split("\n").length, 400);
  assert.match(text, /Diff truncated: \d+ lines omitted/);
});

test("PR and changelog failures warn without preventing the brief", async () => {
  const { cwd, range } = repository();
  const io = ioFor(cwd);
  assert.equal(await run(["feature", "--range", range, "--pr", "42", "--version", "1.0"], io), 0);
  assert.match(io.stderr.join("\n"), /PR 42.*gh unavailable/);
  assert.match(io.stderr.join("\n"), /changelog/);
  assert.match(readFileSync(join(cwd, "campaigns/feature/brief.md"), "utf8"), /Notes from the author/);
});

test("includes PR and matching changelog section", async () => {
  const { cwd, range } = repository();
  writeFileSync(join(cwd, "CHANGELOG.md"), "# Changelog\n\n## [1.2.3] - today\n\nShipped search.\n\n## [1.2.2]\nOld release.\n");
  const io = ioFor(cwd, async () => JSON.stringify({ title: "Search", url: "https://example.com/pr/1", body: "PR detail" }));
  await run(["feature", "--range", range, "--pr", "1", "--version", "1.2.3"], io);
  const text = readFileSync(join(cwd, "campaigns/feature/brief.md"), "utf8");
  assert.match(text, /## \[E5\] PR #1[\s\S]*Search[\s\S]*PR detail/);
  assert.match(text, /## \[E6\] Changelog: 1\.2\.3[\s\S]*Shipped search/);
  assert.doesNotMatch(text, /Old release/);
});

test("requires a git repository", async () => {
  const cwd = tempProject();
  await assert.rejects(run(["feature", "--range", "a..b"], ioFor(cwd)), (err: Error) => err instanceof UserError && /a git repository is required/.test(err.message));
});
