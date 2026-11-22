import { parseArgs } from "node:util";
import { campaignDir, loadConfig } from "../config.ts";
import type { Command } from "../io.ts";
import { loadState } from "../state.ts";
import { UserError } from "../types.ts";

export const run: Command = async (args, io) => {
  const { positionals } = parseArgs({ args, allowPositionals: true });
  if (positionals.length !== 1) throw new UserError("usage: status <slug>");
  const config = loadConfig(io.cwd);
  const state = loadState(campaignDir(config, positionals[0]));
  io.out("destination\tstatus\turl\tat\terror");
  for (const id of config.destinations) {
    const entry = state[id];
    io.out(`${id}\t${entry?.status ?? "-"}\t${entry?.url ?? "-"}\t${entry?.at ?? "-"}\t${entry?.error ?? "-"}`);
  }
  return 0;
};
