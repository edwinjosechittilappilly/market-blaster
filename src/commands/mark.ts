import { parseArgs } from "node:util";
import { campaignDir, loadConfig } from "../config.ts";
import type { Command } from "../io.ts";
import { isDestinationId } from "../links.ts";
import { loadState, updateState, withStateLock } from "../state.ts";
import { UserError } from "../types.ts";

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { url: { type: "string" }, "not-posted": { type: "boolean" } } });
  if (positionals.length !== 2 || (!!values.url === !!values["not-posted"])) throw new UserError("usage: mark <slug> <destination> --url U | --not-posted");
  const config = loadConfig(io.cwd);
  const id = positionals[1];
  if (!isDestinationId(id) || !config.destinations.includes(id)) throw new UserError(`unknown or disabled destination ${id}`);
  const campaign = campaignDir(config, positionals[0]);
  try {
    return await withStateLock(campaign, async () => {
  const state = loadState(campaign);
  if (values["not-posted"]) {
    if (state[id]?.status !== "unknown" && state[id]?.status !== "pending" && state[id]?.lastAttempt?.status !== "unknown") throw new UserError(`${id} is not unknown or pending`);
    const entry = state[id];
    updateState(campaign, state, id, entry?.id
      ? { status: entry.status === "staged" ? "staged" : "published", error: undefined, lastAttempt: undefined }
      : { status: undefined, error: undefined, id: undefined, url: undefined, contentHash: undefined, lastAttempt: undefined });
    io.out(`${id}: cleared for retry`);
  } else {
    let url: URL;
    try { url = new URL(values.url!); } catch { throw new UserError("--url must be an http(s) URL"); }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new UserError("--url must be an http(s) URL");
    updateState(campaign, state, id, { status: "published", url: values.url, contentHash: state[id]?.approvedHash ?? state[id]?.contentHash, error: undefined, lastAttempt: undefined });
    io.out(`${id}: published ${values.url}`);
  }
  return 0;
    });
  } catch (err) {
    if ((err as Error).message !== "campaign state is locked by another process") throw err;
    io.err((err as Error).message); return 1;
  }
};
