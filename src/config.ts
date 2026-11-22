import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";
import { DESTINATION_IDS, UserError, type Config, type DestinationId } from "./types.ts";

export const CONFIG_FILE = "market-blaster.yml";
const CANONICAL_HOMES = ["devto", "hashnode"];

/** Walks up from `start` to the first directory containing market-blaster.yml. */
export function findConfig(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    const file = join(dir, CONFIG_FILE);
    if (existsSync(file)) return file;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadConfig(cwd: string): Config {
  const file = findConfig(cwd);
  if (!file) throw new UserError(`No ${CONFIG_FILE} found from ${cwd} upwards. Run \`mblast init\` first.`);
  let raw: unknown;
  try {
    raw = parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new UserError(`${file}: invalid YAML: ${(err as Error).message}`);
  }
  return validateConfig(raw, dirname(file));
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function validateConfig(raw: unknown, root: string): Config {
  const data = obj(raw);
  const brand = obj(data.brand);
  if (typeof brand.name !== "string" || !brand.name.trim()) {
    throw new UserError(`${CONFIG_FILE}: brand.name is required`);
  }

  const destinations = Array.isArray(data.destinations) ? data.destinations.map(String) : [];
  if (destinations.length === 0) throw new UserError(`${CONFIG_FILE}: destinations must list at least one destination`);
  const unknown = destinations.filter((d) => !(DESTINATION_IDS as readonly string[]).includes(d));
  if (unknown.length) {
    throw new UserError(
      `${CONFIG_FILE}: unknown destination ${unknown.join(", ")} (known: ${DESTINATION_IDS.join(", ")})`,
    );
  }

  const canonicalHome = data.canonicalHome == null ? undefined : String(data.canonicalHome);
  if (canonicalHome && !CANONICAL_HOMES.includes(canonicalHome) && !/^https?:\/\//.test(canonicalHome)) {
    throw new UserError(
      `${CONFIG_FILE}: canonicalHome must be ${CANONICAL_HOMES.join(" or ")} or an http(s) URL, got "${canonicalHome}"`,
    );
  }
  if (canonicalHome && CANONICAL_HOMES.includes(canonicalHome) && !destinations.includes(canonicalHome)) {
    throw new UserError(`${CONFIG_FILE}: canonicalHome "${canonicalHome}" is not in destinations`);
  }

  const agent = obj(data.agent);
  const command = Array.isArray(agent.command) ? agent.command.map(String) : ["omp", "-p"];
  if (command.length === 0) throw new UserError(`${CONFIG_FILE}: agent.command must not be empty`);
  const nostr = obj(data.nostr);
  const newsletter = obj(data.newsletter);
  const targets = newsletter.targets ?? [];
  const allowedTargets = ["console-dev", "javascript-weekly", "golang-weekly", "changelog-news"];
  if (!Array.isArray(targets) || targets.some((target) => typeof target !== "string" || !allowedTargets.includes(target))) {
    throw new UserError(`${CONFIG_FILE}: newsletter.targets contains an unknown target`);
  }
  if (nostr.relays !== undefined && (!Array.isArray(nostr.relays) || nostr.relays.some((relay) => typeof relay !== "string" || !/^wss:\/\//.test(relay)))) {
    throw new UserError(`${CONFIG_FILE}: nostr.relays must be a list of wss URLs`);
  }

  return {
    root,
    brand: brand as unknown as Config["brand"],
    destinations: destinations as DestinationId[],
    canonicalHome,
    campaignsDir: typeof data.campaignsDir === "string" ? data.campaignsDir : "campaigns",
    agent: {
      command,
      timeoutSeconds: typeof agent.timeoutSeconds === "number" && agent.timeoutSeconds > 0 ? agent.timeoutSeconds : 900,
    },
    devto: obj(data.devto),
    hashnode: obj(data.hashnode),
    gist: obj(data.gist),
    githubDiscussion: obj(data.githubDiscussion),
    nostr: { relays: (nostr.relays as string[] | undefined) ?? ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"] },
    lemmy: obj(data.lemmy),
    newsletter: { targets: targets as Config["newsletter"]["targets"] },
    bluesky: obj(data.bluesky),
    mastodon: obj(data.mastodon),
    linkedin: obj(data.linkedin),
    x: obj(data.x),
    reddit: obj(data.reddit),
    substack: obj(data.substack),
  };
}

/** Absolute path of a campaign folder. */
export function campaignDir(config: Config, slug: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new UserError(`campaign slug "${slug}" must be lowercase letters, digits and dashes`);
  }
  return resolve(config.root, config.campaignsDir, slug);
}
