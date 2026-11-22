import { execFileSync } from "node:child_process";
import { UserError } from "./types.ts";

export type KeychainRunner = (args: string[]) => string;
const security: KeychainRunner = (args) => execFileSync("security", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function available(platform: string): void {
  if (platform !== "darwin") throw new UserError("macOS Keychain is unavailable; use a project .env file instead");
}

export function keychainGet(key: string, runner: KeychainRunner = security, platform = process.platform): string | undefined {
  available(platform);
  try {
    return runner(["find-generic-password", "-s", "market-blaster", "-a", key, "-w"]).replace(/\r?\n$/, "") || undefined;
  } catch {
    return undefined;
  }
}

export function keychainSet(key: string, value: string, runner: KeychainRunner = security, platform = process.platform): void {
  available(platform);
  try {
    runner(["add-generic-password", "-U", "-s", "market-blaster", "-a", key, "-w", value]);
  } catch {
    throw new UserError(`Could not save ${key} in Keychain`);
  }
}

export function keychainList(keys: string[], runner: KeychainRunner = security, platform = process.platform): string[] {
  available(platform);
  return keys.filter((key) => keychainGet(key, runner, platform) !== undefined);
}
