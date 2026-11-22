import { parseArgs } from "node:util";
import { campaignDir, loadConfig } from "../config.ts";
import type { Command } from "../io.ts";
import { isDestinationId } from "../links.ts";
import { loadState, updateState } from "../state.ts";
import { UserError } from "../types.ts";

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { url: { type: "string" }, "not-posted": { type: "boolean" } } });
  if (positionals.length !== 2 || (!!values.url === !!values["not-posted"])) throw new UserError("usage: mark <slug> <destination> --url U | --not-posted");
  const config = loadConfig(io.cwd);
  const id = positionals[1];
  if (!isDestinationId(id) || !config.destinations.includes(id)) throw new UserError(`unknown or disabled destination ${id}`);
  const campaign = campaignDir(config, positionals[0]);
  const state = loadState(campaign);
  if (values["not-posted"]) {
    if (state[id]?.status !== "unknown" && state[id]?.status !== "pending") throw new UserError(`${id} is not unknown or pending`);
    updateState(campaign, state, id, { status: undefined, error: undefined, id: undefined, url: undefined, contentHash: undefined });
    io.out(`${id}: cleared for retry`);
  } else {
    let url: URL;
    try { url = new URL(values.url!); } catch { throw new UserError("--url must be an http(s) URL"); }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new UserError("--url must be an http(s) URL");
    updateState(campaign, state, id, { status: "published", url: values.url, contentHash: state[id]?.contentHash ?? state[id]?.approvedHash, error: undefined });
    io.out(`${id}: published ${values.url}`);
  }
  return 0;
};
