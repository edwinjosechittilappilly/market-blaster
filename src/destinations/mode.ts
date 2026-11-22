import type { Config, DestinationId, Env } from "../types.ts";
import { META } from "./meta.ts";

export type Mode = "api" | "handoff" | "missing";

export interface ModeInfo {
  mode: Mode;
  /** Variables that would enable API mode (empty when already in API mode or handoff-only). */
  missing: string[];
  /** Why API mode is off when credentials exist (e.g. `x.api` not true). */
  note?: string;
}

/** Decides how a destination will be handled with the given config and environment. */
export function modeOf(id: DestinationId, config: Config, env: Env): ModeInfo {
  const meta = META[id];
  if (meta.kind === "handoff") return { mode: "handoff", missing: [] };
  const missing = meta.env.filter((k) => !env[k]);
  if (id === "mastodon" && !(env.MASTODON_HOST || config.mastodon.host)) missing.push("MASTODON_HOST or mastodon.host");
  if (id === "hashnode" && !config.hashnode.publicationId) missing.push("hashnode.publicationId");
  const optedIn = !meta.optInApi || config[id as "x" | "linkedin"].api === true;
  if (missing.length === 0 && optedIn) return { mode: "api", missing: [] };
  const fallback: Mode = meta.hasHandoff ? "handoff" : "missing";
  return missing.length === 0
    ? { mode: fallback, missing, note: `set ${id}.api: true in market-blaster.yml to post through the API` }
    : { mode: fallback, missing };
}

/** Fills GITHUB_TOKEN from `gh auth token` when unset, so Gist works with an existing gh login. */
export async function withGithubToken(
  env: Env,
  run: (cmd: string, args: string[]) => Promise<string>,
): Promise<Env> {
  if (env.GITHUB_TOKEN) return env;
  try {
    const token = (await run("gh", ["auth", "token"])).trim();
    return token ? { ...env, GITHUB_TOKEN: token } : env;
  } catch {
    return env;
  }
}
