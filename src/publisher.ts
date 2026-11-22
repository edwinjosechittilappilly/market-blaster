import { setTimeout as delay } from "node:timers/promises";
import { checkCampaign } from "./check.ts";
import { ALL_ENV_VARS, META, publishOrder } from "./destinations/meta.ts";
import { modeOf } from "./destinations/mode.ts";
import { redact } from "./env.ts";
import type { IO } from "./io.ts";
import { measureBody } from "./limits.ts";
import { isDestinationId, linksIn, resolveLinks } from "./links.ts";
import { contentHash, loadState, updateState } from "./state.ts";
import { HttpError, type CampaignState, type Config, type Ctx, type Destination, type DestinationId, type Draft, type Env, type ResolvedPost } from "./types.ts";

interface PublishOptions {
  config: Config; campaign: string; env: Env; io: IO;
  adapters: Record<DestinationId, Destination>; yes?: boolean; stage?: boolean; force?: boolean; open?: boolean;
  only?: DestinationId[]; sleep?: (ms: number) => Promise<void>;
}

function publishedUrls(state: CampaignState): Partial<Record<DestinationId, string>> {
  const urls: Partial<Record<DestinationId, string>> = {};
  for (const [id, entry] of Object.entries(state)) if (entry.status === "published" && entry.url && isDestinationId(id)) urls[id] = entry.url;
  return urls;
}
function resolved(draft: Draft, config: Config, state: CampaignState, pending: boolean): ResolvedPost {
  const urls: Record<string, string> = { ...publishedUrls(state) };
  if (pending) for (const id of config.destinations) if (!urls[id]) urls[id] = `<pending:${id}>`;
  const home = config.canonicalHome;
  const canonical = draft.canonical ?? (home && home !== draft.destination ? (isDestinationId(home) ? urls[home] : home) : undefined);
  return { destination: draft.destination, title: draft.title ? resolveLinks(draft.title, urls) : undefined, tags: draft.tags, body: resolveLinks(draft.body, urls), canonical: canonical ? resolveLinks(canonical, urls) : undefined, contentHash: contentHash(draft) };
}
function connectionRefused(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "ECONNREFUSED" || e?.cause?.code === "ECONNREFUSED";
}
function uncertain(err: unknown): boolean {
  const e = err as { name?: string; code?: string; cause?: { code?: string } };
  return e?.name === "TimeoutError" || e?.name === "AbortError" || ["ECONNRESET", "EPIPE", "UND_ERR_SOCKET"].includes(e?.code ?? e?.cause?.code ?? "");
}

export async function publishCampaign(opts: PublishOptions): Promise<number> {
  const { config, campaign, env, io, adapters } = opts;
  const ctx: Ctx = { config, env, fetch: io.fetch, timeoutMs: 30_000, run: io.run };
  const checked = checkCampaign(config, campaign, { only: opts.only });
  for (const finding of checked.findings) io.out(`${finding.destination}: ${finding.level}: ${finding.message}`);
  if (checked.findings.some((finding) => finding.level === "error")) return 1;
  const order = publishOrder(config.destinations.filter((id) => !opts.only || opts.only.includes(id)), config.canonicalHome);
  const state = loadState(campaign);
  const eligible: DestinationId[] = [];
  let failed = false;
  for (const id of order) {
    const draft = checked.drafts.get(id)!;
    const entry = state[id];
    const mode = modeOf(id, config, env);
    if (entry?.approvedHash !== contentHash(draft)) { io.out(`${id}: refused: draft is not approved or has changed`); failed = true; continue; }
    if (entry?.status === "unknown" || entry?.status === "pending") { io.out(`${id}: refused: ${entry.status} outcome; resolve with mark`); failed = true; continue; }
    if (mode.mode === "missing") { io.out(`${id}: refused: missing ${mode.missing.join(", ")}`); failed = true; continue; }
    if (entry?.status === "published" && entry.contentHash === contentHash(draft)) { io.out(`${id}: published (skipped)`); continue; }
    if (entry?.status === "published" && META[id].kind === "social" && !opts.force) { io.out(`${id}: refused: changed social post requires --force`); failed = true; continue; }
    eligible.push(id);
  }
  if (!opts.yes) {
    for (const id of eligible) {
      const post = resolved(checked.drafts.get(id)!, config, state, true);
      const adapter = adapters[id];
      const mode = modeOf(id, config, env).mode;
      const cost = adapter.cost?.(post);
      const payload = mode === "handoff" ? adapter.handoff?.(post, ctx) : adapter.payload(post, ctx);
      io.out(`${id}: ${mode}${cost === undefined ? "" : ` expected cost $${cost.toFixed(2)}`} text: ${post.body} payload: ${JSON.stringify(payload)}`);
    }
    return failed ? 1 : 0;
  }
  let preflightFailed = false;
  for (const id of eligible) {
    if (modeOf(id, config, env).mode === "api") {
      try { if (!adapters[id].verify) throw new Error("adapter has no credential verification"); await adapters[id].verify!(ctx); }
      catch (err) { io.out(`${id}: preflight failed: ${redact(String((err as Error).message ?? err), env, ALL_ENV_VARS)}`); preflightFailed = true; }
    }
  }
  for (const id of eligible) {
    const draft = checked.drafts.get(id)!;
    const length = measureBody(id, resolveLinks(draft.body, publishedUrls(state), { worstCase: true }), config);
    if (length && length.length > length.max) { io.out(`${id}: preflight failed: ${length.length}/${length.max} ${length.unit}`); preflightFailed = true; }
  }
  if (preflightFailed) return 1;
  for (const id of eligible) {
    const draft = checked.drafts.get(id)!;
    const entry = state[id];
    const adapter = adapters[id];
    const dependencies = [...linksIn(draft.title ?? ""), ...linksIn(draft.body), ...linksIn(draft.canonical ?? "")];
    const home = config.canonicalHome;
    if (!draft.canonical && META[id].kind === "article" && home && isDestinationId(home) && home !== id) dependencies.push(home);
    const blocked = dependencies.find((target) => !isDestinationId(target) || state[target]?.status !== "published" || !state[target]?.url);
    if (blocked) { const error = `link target ${blocked} is not published`; updateState(campaign, state, id, { status: "blocked", error }); io.out(`${id}: blocked: ${error}`); failed = true; continue; }
    const post = resolved(draft, config, state, false);
    if (modeOf(id, config, env).mode === "handoff") {
      try {
        if (!adapter.handoff) throw new Error("adapter has no handoff");
        const info = adapter.handoff(post, ctx);
        if (opts.open) { await io.run("pbcopy", [], { input: post.body }); if (info.url) await io.run("open", [info.url]); }
        if (entry?.status !== "published") updateState(campaign, state, id, { status: "handoff", contentHash: post.contentHash, error: undefined });
        io.out(`${id}: handoff (prefills ${info.prefills})${info.url ? ` ${info.url}` : ""} text: ${post.body}`);
      } catch (err) { const error = redact(String((err as Error).message ?? err), env, ALL_ENV_VARS); updateState(campaign, state, id, { status: "failed", error }); io.out(`${id}: failed: ${error}`); failed = true; }
      continue;
    }
    const stage = !!opts.stage && (id === "devto" || id === "hashnode");
    updateState(campaign, state, id, { status: "pending", error: undefined });
    try {
      let result;
      for (let attempt = 0; ; attempt++) {
        try {
          if (entry?.id && META[id].kind === "article") {
            if (!adapter.update) throw new Error("adapter cannot update existing article");
            result = await adapter.update(entry.id, post, ctx, { stage });
          } else {
            if (!adapter.create) throw new Error("adapter cannot create posts");
            result = await adapter.create(post, ctx, { stage });
          }
          break;
        } catch (err) {
          if (attempt >= 2 || !(err instanceof HttpError && err.status === 429 || connectionRefused(err))) throw err;
          await (opts.sleep ?? delay)(100 * 2 ** attempt);
        }
      }
      const status = stage ? "staged" : "published";
      updateState(campaign, state, id, { status, id: result.id, url: result.url, contentHash: post.contentHash, error: undefined });
      io.out(`${id}: ${status} ${result.url}`);
    } catch (err) {
      const status = uncertain(err) ? "unknown" : "failed";
      const error = redact(String((err as Error).message ?? err), env, ALL_ENV_VARS);
      updateState(campaign, state, id, { status, error });
      io.out(`${id}: ${status}: ${error}`); failed = true;
    }
  }
  return failed ? 1 : 0;
}
