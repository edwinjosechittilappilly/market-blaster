import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { checkCampaign } from "../check.ts";
import { campaignDir, loadConfig } from "../config.ts";
import type { Command } from "../io.ts";
import { isDestinationId, resolveLinks } from "../links.ts";
import { approvalHash, loadState, updateState, withStateLock } from "../state.ts";
import { UserError, type DestinationId } from "../types.ts";

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    only: { type: "string" }, "no-preview": { type: "boolean" },
  } });
  if (positionals.length !== 1) throw new UserError("usage: approve <slug> [--only a,b] [--no-preview]");
  if (!io.isTTY) { io.err("approve requires an interactive terminal"); return 1; }
  const config = loadConfig(io.cwd);
  const campaign = campaignDir(config, positionals[0]);
  const only = values.only?.split(",") as DestinationId[] | undefined;
  if (only?.some((id) => !isDestinationId(id) || !config.destinations.includes(id))) {
    throw new UserError("--only contains an unknown or disabled destination");
  }
  return withStateLock(campaign, async () => {
    const checked = checkCampaign(config, campaign, { only });
    for (const finding of checked.findings) io.out(`${finding.destination}: ${finding.level}: ${finding.message}`);
    if (checked.findings.some((finding) => finding.level === "error")) return 1;
    const state = loadState(campaign);
    const urls: Record<string, string> = {};
    for (const [id, entry] of Object.entries(state)) {
      if (entry.status === "published" && entry.url) urls[id] = entry.url;
    }
    for (const id of config.destinations.filter((id) => !only || only.includes(id))) {
      const draft = checked.drafts.get(id);
      if (!draft || draft.skip) continue;
      const canonical = draft.canonical
        ?? (config.canonicalHome && config.canonicalHome !== id ? config.canonicalHome : "-");
      io.out(
        `${id}${draft.title ? `: ${draft.title}` : ""}\ntags: ${(draft.tags ?? []).join(", ")}\n`
          + `canonical: ${canonical}\n${resolveLinks(draft.body, urls)}`,
      );
      for (const media of draft.media ?? []) {
        io.out(`media: ${media.path}\nalt: ${media.alt}`);
        if (media.captions) io.out(`captions: ${media.captions}`);
      }
      const hash = approvalHash(draft, config);
      if (!values["no-preview"]) {
        for (const media of draft.media ?? []) {
          for (const path of [media.path, ...(media.captions ? [media.captions] : [])]) {
            try { await io.run(process.platform === "darwin" ? "open" : "xdg-open", [resolve(campaign, path)]); }
            catch (error) { io.err(`preview ${path}: ${(error as Error).message}`); }
          }
        }
      }
      const answer = (await io.prompt(`approve ${id}? [y/N]`)).trim();
      if (/^y(?:es)?$/i.test(answer)) {
        if (approvalHash(draft, config) !== hash) {
          io.err(`${id}: media changed during review; approve again`);
          return 1;
        }
        updateState(campaign, state, id, { approvedHash: hash });
      }
    }
    return 0;
  });
};
