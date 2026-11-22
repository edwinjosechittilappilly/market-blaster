import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Env } from "./types.ts";

/** Parses KEY=VALUE lines; supports comments, `export ` prefixes and single/double quotes. */
export function parseDotenv(text: string): Env {
  const out: Env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    const quoted = value.match(/^(['"])(.*)\1$/);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, "");
    out[m[1]] = value;
  }
  return out;
}

/** `.env` from `root` overlaid by the real environment: shell values win. Only `doctor` and `publish` call this. */
export function loadEnv(root: string, processEnv: Env = process.env): Env {
  const file = join(root, ".env");
  const fromFile = existsSync(file) ? parseDotenv(readFileSync(file, "utf8")) : {};
  const merged: Env = { ...fromFile };
  for (const [k, v] of Object.entries(processEnv)) if (v !== undefined && v !== "") merged[k] = v;
  return merged;
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
