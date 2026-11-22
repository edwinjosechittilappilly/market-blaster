import { parseArgs } from "node:util";
import { checkCampaign } from "../check.ts";
import { campaignDir, loadConfig } from "../config.ts";
import type { Command } from "../io.ts";
import { isDestinationId, resolveLinks } from "../links.ts";
import { approvalHash, loadState, updateState, withStateLock } from "../state.ts";
import { UserError, type DestinationId } from "../types.ts";

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { only: { type: "string" } } });
  if (positionals.length !== 1) throw new UserError("usage: approve <slug> [--only a,b]");
  if (!io.isTTY) { io.err("approve requires an interactive terminal"); return 1; }
  const config = loadConfig(io.cwd);
  const campaign = campaignDir(config, positionals[0]);
  const only = values.only?.split(",") as DestinationId[] | undefined;
  if (only?.some((id) => !isDestinationId(id) || !config.destinations.includes(id))) throw new UserError("--only contains an unknown or disabled destination");
  try {
    return await withStateLock(campaign, async () => {
  const checked = checkCampaign(config, campaign, { only });
  for (const finding of checked.findings) io.out(`${finding.destination}: ${finding.level}: ${finding.message}`);
  if (checked.findings.some((finding) => finding.level === "error")) return 1;
  const state = loadState(campaign);
  const urls: Record<string, string> = {};
  for (const [id, entry] of Object.entries(state)) if (entry.status === "published" && entry.url) urls[id] = entry.url;
  for (const id of config.destinations.filter((id) => !only || only.includes(id))) {
    const draft = checked.drafts.get(id);
    if (!draft || draft.skip) continue;
    io.out(`${id}${draft.title ? `: ${draft.title}` : ""}\ntags: ${(draft.tags ?? []).join(", ")}\ncanonical: ${draft.canonical ?? config.canonicalHome ?? "-"}\n${resolveLinks(draft.body, urls)}`);
    if (/^y(?:es)?$/i.test((await io.prompt(`approve ${id}? [y/N]`)).trim())) updateState(campaign, state, id, { approvedHash: approvalHash(draft, config) });
  }
  return 0;
    });
  } catch (err) {
    if ((err as Error).message !== "campaign state is locked by another process") throw err;
    io.err((err as Error).message); return 1;
  }
};
