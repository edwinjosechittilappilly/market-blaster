import { parseArgs } from "node:util";
import { campaignDir, loadConfig } from "../config.ts";
import { ADAPTERS } from "../destinations/index.ts";
import { withGithubToken } from "../destinations/mode.ts";
import { loadEnv } from "../env.ts";
import type { Command } from "../io.ts";
import { isDestinationId } from "../links.ts";
import { publishCampaign } from "../publisher.ts";
import { UserError, type DestinationId } from "../types.ts";

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { yes: { type: "boolean" }, stage: { type: "boolean" }, force: { type: "boolean" }, open: { type: "boolean" }, only: { type: "string" } } });
  if (positionals.length !== 1) throw new UserError("usage: publish <slug> [--yes] [--stage] [--force] [--open] [--only a,b]");
  const config = loadConfig(io.cwd);
  const only = values.only?.split(",") as DestinationId[] | undefined;
  if (only?.some((id) => !isDestinationId(id) || !config.destinations.includes(id))) throw new UserError("--only contains an unknown or disabled destination");
  const env = await withGithubToken(loadEnv(config.root, io.env), io.run);
  return publishCampaign({ config, campaign: campaignDir(config, positionals[0]), env, io, adapters: ADAPTERS, yes: values.yes, stage: values.stage, force: values.force, open: values.open, only });
};
