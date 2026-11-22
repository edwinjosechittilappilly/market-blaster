import { execFile } from "node:child_process";
import { createInterface, type Interface } from "node:readline/promises";
import { run as auth } from "./commands/auth.ts";
import { keychainGet } from "./keychain.ts";
import { run as approve } from "./commands/approve.ts";
import { run as brief } from "./commands/brief.ts";
import { run as check } from "./commands/check.ts";
import { run as doctor } from "./commands/doctor.ts";
import { run as draft } from "./commands/draft.ts";
import { run as init } from "./commands/init.ts";
import { run as installSkill } from "./commands/install-skill.ts";
import { run as launch } from "./commands/launch.ts";
import { run as mark } from "./commands/mark.ts";
import { run as newCampaign } from "./commands/new.ts";
import { run as publish } from "./commands/publish.ts";
import { run as status } from "./commands/status.ts";
import type { Command, IO } from "./io.ts";
import { UserError } from "./types.ts";

const COMMANDS: Record<string, { summary: string; run: Command }> = {
  init: { summary: "write market-blaster.yml and .env.example", run: init },
  auth: { summary: "manage credentials: auth set <KEY> [--stdin] | list | linkedin", run: auth },
  doctor: { summary: "show which destinations publish by API and which hand off [--online]", run: doctor },
  new: { summary: "brief + draft + check in one go: new <slug> --range A..B [--pr N]", run: newCampaign },
  brief: { summary: "collect evidence: brief <slug> --range A..B [--pr N] [--version V] [--force]", run: brief },
  draft: { summary: "AI-draft every destination from the brief: draft <slug> [--force]", run: draft },
  check: { summary: "validate drafts: check <slug> [--strict]", run: check },
  approve: { summary: "review and approve drafts (interactive): approve <slug> [--only a,b]", run: approve },
  publish: {
    summary: "publish approved drafts: publish <slug> [--yes] [--stage] [--only a,b] [--force] [--open] [--assist]",
    run: publish,
  },
  mark: { summary: "record a manual outcome: mark <slug> <destination> --url U | --not-posted", run: mark },
  launch: {
    summary: "show project launch checklist or record a listing: launch [--mark <directory> --url U]", run: launch,
  },
  status: { summary: "show what was published where: status <slug>", run: status },
  "install-skill": { summary: "link the drafting skill into ~/.agents/skills and ~/.claude/skills", run: installSkill },
};

export function help(): string {
  const width = Math.max(...Object.keys(COMMANDS).map((c) => c.length));
  return [
    "mblast: turn a shipped feature into posts for the platforms developers read",
    "",
    "Usage: mblast <command> [options]",
    "",
    ...Object.entries(COMMANDS).map(([name, c]) => `  ${name.padEnd(width)}  ${c.summary}`),
    "",
    "Guide: docs/guide.md",
  ].join("\n");
}

function runProgram(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string | undefined>; input?: string; timeoutMs?: number } = {},
): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const child = execFile(
    cmd,
    args,
    {
      cwd: opts.cwd,
      env: opts.env as NodeJS.ProcessEnv | undefined,
      maxBuffer: 64 * 1024 * 1024,
      timeout: opts.timeoutMs ?? 0,
    },
    (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      // error.message repeats the full argv (possibly a whole prompt), so build the reason from the exit status only.
      const reason = error.killed && opts.timeoutMs
        ? `timed out after ${opts.timeoutMs / 1000}s` : `exited with ${error.code ?? error.signal}`;
      const tail = stderr.trim().split("\n").slice(-20).join("\n");
      reject(new Error(`${cmd} ${reason}${tail ? `:\n${tail}` : ""}`));
    },
  );
  if (opts.input !== undefined) child.stdin?.end(opts.input);
  return promise;
}

/** One readline interface for the whole run, so pasted multi-line answers are not dropped between prompts. */
let readline: Interface | undefined;

export function realIO(): IO {
  return {
    cwd: process.cwd(),
    env: process.env,
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    isTTY: Boolean(process.stdin.isTTY),
    async prompt(question) {
      readline ??= createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await readline.question(`${question} `);
      } catch (err) {
        // Ctrl+D / Ctrl+C at a prompt means "no", not a crash.
        if ((err as Error).name === "AbortError") return "";
        throw err;
      }
    },
    fetch: globalThis.fetch,
    run: runProgram,
    keychain: process.platform === "darwin" ? (key) => keychainGet(key) : undefined,
  };
}

export async function main(argv: string[], io: IO = realIO()): Promise<number> {
  const [name, ...rest] = argv;
  if (!name || name === "--help" || name === "-h" || name === "help") {
    io.out(help());
    return name ? 0 : 1;
  }
  const command = COMMANDS[name];
  if (!command) {
    io.err(`unknown command "${name}"\n\n${help()}`);
    return 1;
  }
  try {
    return await command.run(rest, io);
  } catch (err) {
    if (err instanceof UserError) {
      io.err(`error: ${err.message}`);
      return 1;
    }
    throw err;
  } finally {
    readline?.close();
    readline = undefined;
  }
}
