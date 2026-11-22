import type { Env } from "./types.ts";

/** Everything a command touches outside the filesystem; tests pass a fake. */
export interface IO {
  cwd: string;
  env: Env;
  out(line: string): void;
  err(line: string): void;
  /** True when stdin is an interactive terminal. */
  isTTY: boolean;
  /** Reads one line of user input (only called when isTTY). */
  prompt(question: string): Promise<string>;
  fetch: typeof fetch;
  /** Runs a program, returning stdout; rejects with stderr on non-zero exit. */
  run(cmd: string, args: string[], opts?: { cwd?: string; env?: Env; input?: string }): Promise<string>;
}

export type Command = (args: string[], io: IO) => Promise<number>;
