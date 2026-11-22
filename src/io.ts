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
  /**
   * Runs a program, returning stdout; rejects on non-zero exit. The rejection message carries the program name
   * and stderr, never the arguments (they can hold a whole prompt). `timeoutMs` kills the process when exceeded.
   */
  run(
    cmd: string,
    args: string[],
    opts?: { cwd?: string; env?: Env; input?: string; timeoutMs?: number },
  ): Promise<string>;
  /** Reads a credential from the macOS Keychain; undefined in tests so no test can touch the real Keychain. */
  keychain?: (key: string) => string | undefined;
}

export type Command = (args: string[], io: IO) => Promise<number>;
