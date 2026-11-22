import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { META, publishOrder } from "./destinations/meta.ts";
import { loadDrafts } from "./drafts.ts";
import { measureBody, measureTitle } from "./limits.ts";
import { linksIn, resolveLinks } from "./links.ts";
import type { Config, DestinationId, Draft } from "./types.ts";

export interface Finding { destination: DestinationId; level: "error" | "warning"; message: string }
export interface CheckResult { drafts: Map<DestinationId, Draft>; findings: Finding[] }

export function checkCampaign(config: Config, campaign: string, opts: { only?: DestinationId[] } = {}): CheckResult {
  const drafts = loadDrafts(campaign);
  for (const id of drafts.keys()) if (META[id].ai === "none") drafts.delete(id);
  const findings: Finding[] = [];
  const order = publishOrder(config.destinations, config.canonicalHome);
  const briefPath = join(campaign, "brief.md");
  const brief = existsSync(briefPath) ? readFileSync(briefPath, "utf8") : "";
  const anchors = new Set([...brief.matchAll(/^##[ \t]+\[(E\d+)\](?:[ \t]|$)/gm)].map((m) => m[1]));
  for (const destination of order.filter((id) => !opts.only || opts.only.includes(id))) {
    const add = (level: Finding["level"], message: string) => findings.push({ destination, level, message });
    if (META[destination].ai === "none") continue;
    const draft = drafts.get(destination);
    if (!draft) { add("error", "missing draft"); continue; }
    if (draft.skip) continue;
    if (META[destination].needsTitle && !draft.title?.trim()) add("error", "missing required title");
    if (!draft.evidence.length || draft.evidence.some((e) => !e.trim())) add("error", "missing required evidence");
    for (const anchor of draft.evidence) if (!anchors.has(anchor)) add("error", `unknown evidence anchor ${anchor}`);
    const text = [draft.title ?? "", META[destination].ai === "outline" ? "" : draft.body, draft.canonical ?? ""].join("\n");
    for (const link of new Set(linksIn(text))) {
      const index = order.indexOf(link as DestinationId);
      if (index < 0) add("error", `link to ${link}: destination is not enabled`);
      else if (index >= order.indexOf(destination)) add("error", `link to ${link}: destination is not earlier in publish order`);
    }
    const body = META[destination].ai === "outline" ? null : measureBody(destination, resolveLinks(draft.body, {}, { worstCase: true }), config);
    const title = draft.title ? measureTitle(destination, resolveLinks(draft.title, {}, { worstCase: true })) : null;
    for (const measure of [body, title]) if (measure && measure.length > measure.max) {
      const uncertainMastodon = destination === "mastodon" && measure === body && config.mastodon.maxChars == null && measure.length < 11000;
      add(uncertainMastodon ? "warning" : "error", uncertainMastodon
        ? `${measure.length} ${measure.unit} exceeds default 500; instance limit is verified at publish preflight`
        : `${measure.length} ${measure.unit} exceeds limit ${measure.max}`);
    }
    const groundingText = text.replace(/https?:\/\/[^\s<>)\]]+|\{\{url:[^}]*\}\}/g, "").replace(/^[ \t]*\d[.)][ \t]+/gm, "");
    const tokens = groundingText.match(/`[^`\n]+`|(?<![\w.])v?\d+(?:,\d{3})*(?:\.\d+)*(?:[-+][\w.-]+)?(?:%|[a-zA-Zµ]+)?/g) ?? [];
    for (const token of new Set(tokens)) {
      const value = token.startsWith("`") ? token.slice(1, -1) : token;
      if (!brief.includes(value)) add("warning", `${token} not found in brief`);
    }
  }
  return { drafts, findings };
}
