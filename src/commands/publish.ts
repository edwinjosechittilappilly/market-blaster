import { parseArgs } from "node:util";
import { assistCampaign } from "../assist.ts";
import { campaignDir, loadConfig } from "../config.ts";
import { ADAPTERS } from "../destinations/index.ts";
import { withGithubToken } from "../destinations/mode.ts";
import { destinationEnvVars, loadEnv } from "../env.ts";
import type { Command } from "../io.ts";
import { isDestinationId } from "../links.ts";
import { publishCampaign } from "../publisher.ts";
import { UserError, type DestinationId } from "../types.ts";

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: {
      yes: { type: "boolean" }, stage: { type: "boolean" }, force: { type: "boolean" }, open: { type: "boolean" },
      assist: { type: "boolean" }, only: { type: "string" }, json: { type: "boolean" },
    },
  });
  if (positionals.length !== 1) {
    throw new UserError("usage: publish <slug> [--yes] [--stage] [--force] [--open] [--assist] [--only a,b] [--json]");
  }
  if (values.assist && (values.yes || values.stage || values.force || values.open || values.json)) {
    throw new UserError("--assist cannot be combined with --yes, --stage, --force, --open or --json");
  }
  if (values.json && values.yes) throw new UserError("--json is only available for dry runs");
  if (values.assist && !io.isTTY) throw new UserError("--assist requires an interactive terminal");
  const config = loadConfig(io.cwd);
  const only = values.only?.split(",") as DestinationId[] | undefined;
  if (only?.some((id) => !isDestinationId(id) || !config.destinations.includes(id))) {
    throw new UserError("--only contains an unknown or disabled destination");
  }
  const env = loadEnv(config.root, io.env, io.keychain, destinationEnvVars(only ?? config.destinations));
  if (values.assist) {
    return assistCampaign({ config, campaign: campaignDir(config, positionals[0]), env, io, adapters: ADAPTERS, only });
  }
  const needsGithub = (only ?? config.destinations).some(id => id === "gist" || id === "github-discussion");
  return publishCampaign({
    config, campaign: campaignDir(config, positionals[0]), env: needsGithub ? await withGithubToken(env, io.run) : env,
    io, adapters: ADAPTERS, yes: values.yes, stage: values.stage, force: values.force, open: values.open, only,
    json: values.json,
  });
};
