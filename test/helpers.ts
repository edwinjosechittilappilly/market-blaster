import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { IO } from "../src/io.ts";
import type { Env } from "../src/types.ts";

export const BASIC_CONFIG = `brand:
  name: Demo
  pitch: Demo tool
destinations: [devto, gist, bluesky, mastodon, x, hn]
canonicalHome: devto
mastodon:
  host: mastodon.example
agent:
  command: [node, fake-agent.mjs]
`;

// Each test file runs in its own process; remove its temp projects when it exits.
const created: string[] = [];
process.on("exit", () => { for (const dir of created) rmSync(dir, { recursive: true, force: true }); });

/** A temp directory with the given files (paths relative to it). */
export function tempProject(files: Record<string, string> = { "market-blaster.yml": BASIC_CONFIG }): string {
  const dir = mkdtempSync(join(tmpdir(), "mblast-"));
  created.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

export interface FakeIO extends IO {
  stdout: string[];
  stderr: string[];
  text(): string;
}

/** IO that records output; network and subprocesses fail unless provided. */
export function fakeIO(opts: Partial<IO> & { cwd: string; env?: Env; answers?: string[] }): FakeIO {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const answers = [...(opts.answers ?? [])];
  return {
    env: {},
    isTTY: false,
    fetch: (async () => {
      throw new Error("unexpected network call in test");
    }) as typeof fetch,
    run: async (cmd: string) => {
      throw new Error(`unexpected subprocess ${cmd} in test`);
    },
    prompt: async () => answers.shift() ?? "",
    ...opts,
    out: (line: string) => stdout.push(line),
    err: (line: string) => stderr.push(line),
    stdout,
    stderr,
    text: () => [...stdout, ...stderr].join("\n"),
  };
}

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** fetch stub: `handler` returns [status, json]; every call is recorded. */
export function mockFetch(
  handler: (call: RecordedCall) => [number, unknown] | Promise<[number, unknown]>,
): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fn = async (input: string | URL | Request, init: RequestInit = {}) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    const call = { url: String(input), method: init.method ?? "GET", headers, body: String(init.body ?? "") };
    calls.push(call);
    const [status, json] = await handler(call);
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  };
  return { fetch: fn as typeof fetch, calls };
}
