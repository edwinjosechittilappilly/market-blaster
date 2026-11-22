import { execFileSync } from "node:child_process";
import { UserError } from "./types.ts";

export type KeychainRunner = (args: string[], input?: string) => string;
const security: KeychainRunner = (args, input) => execFileSync("security", args, {
  encoding: "utf8", input, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
});

function guardTestRunner(runner: KeychainRunner): void {
  if (runner === security && process.env.NODE_TEST_CONTEXT) throw new Error("Tests must inject a Keychain runner");
}

function available(platform: string): void {
  if (platform !== "darwin") throw new UserError("macOS Keychain is unavailable; use a project .env file instead");
}

export function keychainGet(
  key: string, runner: KeychainRunner = security, platform = process.platform,
): string | undefined {
  available(platform);
  guardTestRunner(runner);
  try {
    return runner(["find-generic-password", "-s", "market-blaster", "-a", key, "-w"])
      .replace(/\r?\n$/, "") || undefined;
  } catch (err) {
    if (typeof err === "object" && err !== null && "status" in err && err.status === 44) return undefined;
    throw new UserError(`Could not read ${key} from Keychain`);
  }
}

export function keychainSet(
  key: string, value: string, runner: KeychainRunner = security, platform = process.platform,
): void {
  available(platform);
  guardTestRunner(runner);
  // security's interactive parser has a 4096-byte line buffer.
  const command = `add-generic-password -U -s market-blaster -a ${JSON.stringify(key)} -T "" -X ${
    Buffer.from(value).toString("hex")}\n`;
  if (Buffer.byteLength(command) >= 4096)
    throw new UserError(`Could not save ${key} in Keychain: credential is too long`);
  try {
    // Hex avoids interpreting password quotes, backslashes or newlines as commands.
    runner(["-i"], command);
  } catch {
    throw new UserError(`Could not save ${key} in Keychain`);
  }
}

