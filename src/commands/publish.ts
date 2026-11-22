import { parseArgs } from "node:util";
import { assistCampaign } from "../assist.ts";
import { campaignDir, loadConfig } from "../config.ts";
import { ADAPTERS } from "../destinations/index.ts";
import { withGithubToken } from "../destinations/mode.ts";
import { loadEnv } from "../env.ts";
import type { Command } from "../io.ts";
import { isDestinationId } from "../links.ts";
import { publishCampaign } from "../publisher.ts";
import { UserError, type DestinationId } from "../types.ts";

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { yes: { type: "boolean" }, stage: { type: "boolean" }, force: { type: "boolean" }, open: { type: "boolean" }, assist: { type: "boolean" }, only: { type: "string" } } });
  if (positionals.length !== 1) throw new UserError("usage: publish <slug> [--yes] [--stage] [--force] [--open] [--assist] [--only a,b]");
  if (values.assist && (values.yes || values.stage || values.force || values.open)) throw new UserError("--assist cannot be combined with --yes, --stage, --force or --open");
  if (values.assist && !io.isTTY) throw new UserError("--assist requires an interactive terminal");
  const config = loadConfig(io.cwd);
  const only = values.only?.split(",") as DestinationId[] | undefined;
  if (only?.some((id) => !isDestinationId(id) || !config.destinations.includes(id))) throw new UserError("--only contains an unknown or disabled destination");
  const env = loadEnv(config.root, io.env, io.keychain);
  if (values.assist) return assistCampaign({ config, campaign: campaignDir(config, positionals[0]), env, io, adapters: ADAPTERS, only });
  return publishCampaign({ config, campaign: campaignDir(config, positionals[0]), env: await withGithubToken(env, io.run), io, adapters: ADAPTERS, yes: values.yes, stage: values.stage, force: values.force, open: values.open, only });
};
