import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_ENV_VARS, META } from "./destinations/meta.ts";
import type { DestinationId, Env } from "./types.ts";

/** Parses KEY=VALUE lines; supports comments, `export ` prefixes and single/double quotes. */
export function parseDotenv(text: string): Env {
  const out: Env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2].trim();
    const quoted = value.match(/^(['"])(.*?)\1(?:\s*#.*)?\s*$/);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, "").trim();
    out[m[1]] = value;
  }
  return out;
}

export const AUTH_ENV_VARS = [...ALL_ENV_VARS, "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "LINKEDIN_TOKEN_ISSUED"];
export type EnvSource = "shell" | ".env" | "keychain";

/** Keychain keys consumed by the selected destinations, including optional settings. */
export function destinationEnvVars(destinations: DestinationId[]): string[] {
  const keys = new Set(destinations.flatMap((id) => META[id].env));
  if (destinations.includes("bluesky")) keys.add("BLUESKY_HOST");
  if (destinations.includes("mastodon")) keys.add("MASTODON_HOST");
  if (destinations.includes("linkedin")) keys.add("LINKEDIN_TOKEN_ISSUED");
  return [...keys];
}

export function loadEnvWithSources(
  root: string,
  processEnv: Env = process.env,
  keychain: (key: string) => string | undefined = () => undefined,
  keys: readonly string[] = AUTH_ENV_VARS,
): { env: Env; sources: Record<string, EnvSource> } {
  const file = join(root, ".env");
  const fromFile = existsSync(file) ? parseDotenv(readFileSync(file, "utf8")) : {};
  const env: Env = {};
  const sources: Record<string, EnvSource> = {};
  for (const [key, value] of Object.entries(fromFile)) {
    if (value) { env[key] = value; sources[key] = ".env"; }
  }
  for (const [key, value] of Object.entries(processEnv)) {
    if (value) { env[key] = value; sources[key] = "shell"; }
  }
  for (const key of keys) {
    if (env[key]) continue;
    const value = keychain(key);
    if (value) { env[key] = value; sources[key] = "keychain"; }
  }
  return { env, sources };
}

export function loadEnv(root: string, processEnv: Env = process.env, keychain?: (key: string) => string | undefined, keys?: readonly string[]): Env {
  return loadEnvWithSources(root, processEnv, keychain, keys).env;
}

/** Replaces every credential value found in `text` with `***`. */
export function redact(text: string, env: Env, keys: string[]): string {
  let out = text;
  for (const key of keys) {
    const value = env[key];
    if (value && value.length >= 4) out = out.split(value).join("***");
  }
  return out;
}
