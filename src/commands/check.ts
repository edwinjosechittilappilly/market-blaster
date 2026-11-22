import { parseArgs } from "node:util";
import { checkCampaign } from "../check.ts";
import { campaignDir, loadConfig } from "../config.ts";
import { isDestinationId } from "../links.ts";
import type { Command } from "../io.ts";
import { UserError } from "../types.ts";

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true, options: { strict: { type: "boolean" }, only: { type: "string" } },
  });
  if (positionals.length !== 1) throw new UserError("usage: mblast check <slug> [--strict] [--only a,b]");
  const only = values.only?.split(",");
  if (only?.some((id) => !isDestinationId(id))) throw new UserError(`unknown destination in --only: ${values.only}`);
  const config = loadConfig(io.cwd);
  const { findings } = checkCampaign(config, campaignDir(config, positionals[0]), {
    only: only?.filter(isDestinationId),
  });
  for (const f of findings) io.out(`${f.destination}  ${f.level}  ${f.message}`);
  const errors = findings.filter((f) => f.level === "error").length;
  const warnings = findings.length - errors;
  io.out(`${errors} error(s), ${warnings} warning(s)`);
  return errors || (values.strict && warnings) ? 1 : 0;
};
