import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { campaignDir, loadConfig } from "../config.ts";
import type { Command } from "../io.ts";
import { UserError } from "../types.ts";

function showcase(path: string): boolean {
  const name = basename(path);
  return /^readme/i.test(name) || /^(docs|examples|test|tests)\//i.test(path) ||
    /test/i.test(name) || /^(package\.json|pyproject\.toml|Cargo\.toml|go\.mod)$/.test(name) ||
    /^src\/(index|main)\.[^/]+$/.test(path) || /^main\.[^/]+$/.test(path);
}

function changelogSection(text: string, version: string): string | undefined {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const heading = /^##\s+(.+?)\s*$/.exec(line)?.[1];
    return heading === version || heading === `[${version}]` ||
      heading?.startsWith(`${version} `) || heading?.startsWith(`[${version}] `);
  });
  if (start < 0) return undefined;
  let end = start + 1;
  while (end < lines.length && !/^##\s+/.test(lines[end])) end++;
  return lines.slice(start, end).join("\n").trim();
}

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      range: { type: "string" }, pr: { type: "string" }, version: { type: "string" },
      force: { type: "boolean", default: false },
    },
  });
  if (positionals.length !== 1 || !values.range || !/^[^-\s][^\s]*\.\.[^\s]+$/.test(values.range)) {
    throw new UserError("usage: mblast brief <slug> --range A..B [--pr N] [--version V] [--force]");
  }
  if (values.pr !== undefined && !/^\d+$/.test(values.pr)) throw new UserError("--pr must be a number");
  const config = loadConfig(io.cwd);
  const dir = campaignDir(config, positionals[0]);
  const path = join(dir, "brief.md");
  if (existsSync(path) && !values.force) throw new UserError(`${path} already exists; use --force to overwrite it`);
  const opts = { cwd: config.root };
  try {
    await io.run("git", ["rev-parse", "--show-toplevel"], opts);
  } catch {
    throw new UserError("a git repository is required");
  }
  let remote = "";
  try {
    remote = (await io.run("git", ["remote", "get-url", "origin"], opts)).trim();
    // A remote may contain embedded credentials; never persist them in the brief.
    remote = remote.replace(/(\w+:\/\/)[^/@\s]+@/g, "$1");
  } catch { /* A repository need not have an origin. */ }

  const range = values.range;
  const commits = await io.run("git", ["log", "--format=%h %s%n%b", range, "--"], opts);
  const stat = await io.run("git", ["diff", "--stat", range, "--"], opts);
  const changed = await io.run("git", ["diff", "--name-only", "-z", range, "--"], opts);
  const sections: string[] = [];
  let anchor = 0;
  const add = (title: string, body: string) => {
    sections.push(`## [E${++anchor}] ${title}\n\n${body.trim()}\n`);
  };
  add("Repository", remote || "No origin remote configured.");
  add("Commits", commits || "No commits in range.");
  add("Changed files", stat || "No changed files.");

  let remaining = 400;
  let omitted = 0;
  for (const file of changed.split("\0").filter(Boolean).filter(showcase)) {
    const diff = await io.run("git", ["diff", "--no-ext-diff", "--no-color", range, "--", file], opts);
    const lines = diff.replace(/\n$/, "").split("\n");
    if (!diff) continue;
    const included = lines.slice(0, remaining);
    remaining -= included.length;
    omitted += lines.length - included.length;
    if (included.length) add(`Diff: ${file}`, `\`\`\`diff\n${included.join("\n")}\n\`\`\``);
  }
  if (omitted) sections.push(`Diff truncated: ${omitted} lines omitted.\n`);

  if (values.pr) {
    try {
      const raw = await io.run("gh", ["pr", "view", values.pr, "--json", "title,url,body"], opts);
      const pr = JSON.parse(raw) as { title: string; url: string; body: string };
      add(`PR #${values.pr}`, `${pr.title}\n${pr.url}\n\n${pr.body ?? ""}`);
    } catch (err) {
      io.err(`warning: could not read PR ${values.pr}: ${(err as Error).message}`);
    }
  }
  if (values.version) {
    try {
      const content = readFileSync(join(config.root, "CHANGELOG.md"), "utf8");
      const section = changelogSection(content, values.version);
      if (!section) throw new Error(`version ${values.version} not found in CHANGELOG.md`);
      add(`Changelog: ${values.version}`, section);
    } catch (err) {
      io.err(`warning: could not read changelog: ${(err as Error).message}`);
    }
  }
  sections.push("## Notes from the author\n\n<!-- Add context, caveats, and other details about what shipped. -->\n");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, sections.join("\n"));
  io.out(`Wrote ${path} (${anchor} evidence anchors)`);
  return 0;
};
