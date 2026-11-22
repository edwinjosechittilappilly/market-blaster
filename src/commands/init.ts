import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE } from "../config.ts";
import { ALL_ENV_VARS } from "../destinations/meta.ts";
import type { Command } from "../io.ts";

const STARTER = `# Market Blaster config. Guide: https://github.com/edwinjosechittilappilly/market-blaster/blob/main/docs/guide.md
brand:
  name: My Project
  pitch: One sentence on what it does and for whom.
  audience: Developers who ...
  voice:
    - Plain, specific, first person. Show code, not adjectives.
    - No hype words (revolutionary, game-changing, excited to announce).
  links:
    repo: https://github.com/you/project
  hashtags: [opensource]

# API destinations publish directly; handoff destinations print copy and a compose link.
destinations: [devto, gist, bluesky, mastodon, linkedin, x, hn, reddit]

# The original article URL search engines should credit: devto, hashnode, or your own blog URL.
canonicalHome: devto

# Where campaigns live. Point outside the repo if the repo is public and drafts must stay private before launch.
campaignsDir: campaigns

# Headless agent that writes drafts (prompt is appended as the last argument).
agent:
  command: [omp, -p]

devto:
  tags: [opensource, showdev]
  publish: false        # false: create unpublished DEV drafts first
hashnode:
  publicationId: ""     # needs a Hashnode Pro publication
gist:
  public: true
bluesky:
  host: bsky.social
mastodon:
  host: mastodon.social
linkedin:
  api: false            # true: post through the API with LINKEDIN_ACCESS_TOKEN; false: share link handoff
x:
  api: false            # true: post through the API (pay per post); false: intent link handoff
reddit:
  subreddit: programming
substack:
  url: ""
`;

const ENV_DOC: Record<string, string> = {
  DEV_API_KEY: "https://dev.to/settings/extensions -> DEV Community API Keys",
  HASHNODE_TOKEN: "https://hashnode.com/settings/developer (publication must be Pro)",
  GITHUB_TOKEN: "optional: falls back to `gh auth token` (needs gist scope)",
  BLUESKY_IDENTIFIER: "your handle, e.g. you.bsky.social",
  BLUESKY_APP_PASSWORD: "https://bsky.app/settings/app-passwords",
  BLUESKY_HOST: "optional PDS host, default bsky.social",
  MASTODON_TOKEN: "your instance -> Preferences -> Development -> New application (write:statuses, read:accounts)",
  MASTODON_HOST: "optional, overrides mastodon.host",
  LINKEDIN_ACCESS_TOKEN: "OAuth token with w_member_social (valid ~60 days); see docs/guide.md",
  X_API_KEY: "developer.x.com app consumer key (pay per post)",
  X_API_SECRET: "consumer secret",
  X_ACCESS_TOKEN: "user access token (read+write)",
  X_ACCESS_SECRET: "user access token secret",
};

export const run: Command = async (_args, io) => {
  const configFile = join(io.cwd, CONFIG_FILE);
  if (existsSync(configFile)) io.out(`kept existing ${CONFIG_FILE}`);
  else {
    writeFileSync(configFile, STARTER);
    io.out(`wrote ${CONFIG_FILE}: set brand.name, pitch and links`);
  }

  const envExample = join(io.cwd, ".env.example");
  if (!existsSync(envExample)) {
    const lines = ["# Copy to .env (gitignored). Shell environment values win over .env.", ""];
    for (const key of ALL_ENV_VARS) lines.push(`# ${ENV_DOC[key] ?? ""}`, `${key}=`, "");
    writeFileSync(envExample, lines.join("\n"));
    io.out("wrote .env.example");
  }

  const gitignore = join(io.cwd, ".gitignore");
  const current = existsSync(gitignore) ? readFileSync(gitignore, "utf8") : "";
  if (!current.split(/\r?\n/).some((l) => l.trim() === ".env")) {
    appendFileSync(gitignore, `${current && !current.endsWith("\n") ? "\n" : ""}.env\n`);
    io.out("added .env to .gitignore");
  }
  io.out("next: mblast doctor");
  return 0;
};
