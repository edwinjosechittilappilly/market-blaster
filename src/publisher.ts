import { setTimeout as delay } from "node:timers/promises";
import { checkCampaign } from "./check.ts";
import { ALL_ENV_VARS, META, publishOrder } from "./destinations/meta.ts";
import { modeOf } from "./destinations/mode.ts";
import { loadDrafts } from "./drafts.ts";
import { redact } from "./env.ts";
import type { IO } from "./io.ts";
import { measureBody } from "./limits.ts";
import { isDestinationId, linksIn, resolveLinks } from "./links.ts";
import { approvalHash, loadState, updateState, withStateLock } from "./state.ts";
import { HttpError, type CampaignState, type Config, type Ctx, type Destination, type DestinationId, type Draft, type Env, type ResolvedPost } from "./types.ts";

interface PublishOptions {
  config: Config; campaign: string; env: Env; io: IO;
  adapters: Record<DestinationId, Destination>; yes?: boolean; stage?: boolean; force?: boolean; open?: boolean;
  only?: DestinationId[]; sleep?: (ms: number) => Promise<void>; crosspost?: Ctx["crosspost"];
}

function publishedUrls(state: CampaignState): Partial<Record<DestinationId, string>> {
  const urls: Partial<Record<DestinationId, string>> = {};
  for (const [id, entry] of Object.entries(state)) if (entry.status === "published" && entry.url && isDestinationId(id)) urls[id] = entry.url;
  return urls;
}
/** Destinations that link to (and so depend on) the canonical home: article canonical fields, HN/Reddit links, Discussions. */
const usesCanonical = (id: DestinationId) => ["devto", "hashnode", "hn", "reddit", "github-discussion"].includes(id);
export function resolved(draft: Draft, config: Config, state: CampaignState, pending: boolean): ResolvedPost {
  const urls: Record<string, string> = { ...publishedUrls(state) };
  if (pending) for (const id of config.destinations) if (!urls[id]) urls[id] = `<pending:${id}>`;
  const home = config.canonicalHome;
  const canonical = usesCanonical(draft.destination) ? draft.canonical ?? (home && home !== draft.destination ? (isDestinationId(home) ? urls[home] : home) : undefined) : undefined;
  return { destination: draft.destination, title: draft.title ? resolveLinks(draft.title, urls) : undefined, tags: draft.tags, body: resolveLinks(draft.body, urls), canonical: canonical ? resolveLinks(canonical, urls) : undefined, contentHash: approvalHash(draft, config) };
}
function connectionRefused(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "ECONNREFUSED" || e?.cause?.code === "ECONNREFUSED";
}
function uncertain(err: unknown): boolean {
  const e = err as { name?: string; code?: string; cause?: { code?: string }; status?: number };
  const code = e?.code ?? e?.cause?.code ?? "";
  return e?.name === "TimeoutError" || e?.name === "AbortError" || e?.name === "UncertainResponseError"
    || code === "ETIMEDOUT" || code === "ECONNRESET" || code === "EPIPE" || code === "UND_ERR_SOCKET"
    || (code.startsWith("UND_ERR_") && code.includes("TIMEOUT"))
    || (err instanceof HttpError && [502, 503, 504, 522, 524].includes(err.status));
}

function retryDelay(err: unknown, attempt: number): number {
  const value = (err as { retryAfter?: string }).retryAfter;
  if (value && /^\d+(?:\.\d+)?$/.test(value)) return Math.min(30_000, Number(value) * 1000);
  return 100 * 2 ** attempt;
}

export async function publishCampaign(opts: PublishOptions): Promise<number> {
  try {
    return await withStateLock(opts.campaign, () => publishLocked(opts));
  } catch (err) {
    if ((err as Error).message !== "campaign state is locked by another process") throw err;
    opts.io.err((err as Error).message); return 1;
  }
}

async function publishLocked(opts: PublishOptions): Promise<number> {
  const { config, campaign, env, io, adapters } = opts;
  const ctx: Ctx = { config: { ...config, mastodon: { ...config.mastodon } }, env, fetch: io.fetch, timeoutMs: 30_000, run: io.run, crosspost: opts.crosspost };
  const checkOnly = opts.stage ? config.destinations.filter((id) => (id === "devto" || id === "hashnode") && (!opts.only || opts.only.includes(id))) : opts.only;
  const checked = checkCampaign(config, campaign, { only: checkOnly });
  for (const finding of checked.findings) io.out(`${finding.destination}: ${finding.level}: ${finding.message}`);
  if (checked.findings.some((finding) => finding.level === "error")) return 1;
  const order = publishOrder(config.destinations.filter((id) => !opts.only || opts.only.includes(id)), config.canonicalHome);
  const state = loadState(campaign);
  const home = config.canonicalHome;
  const homeDraft = isDestinationId(home ?? "") ? loadDrafts(campaign).get(home as DestinationId) : undefined;
  const hnDraft: Draft = { destination: "hn", title: homeDraft?.title, evidence: [], body: "", path: "" };
  const draftFor = (id: DestinationId) => id === "hn" ? hnDraft : checked.drafts.get(id)!;
  const eligible: DestinationId[] = [];
  let failed = false;
  for (const id of order) {
    const draft = draftFor(id);
    const entry = state[id];
    if (draft?.skip) { io.out(`${id}: skipped (${draft.skip})`); continue; }
    if (opts.stage && id !== "devto" && id !== "hashnode") { io.out(`${id}: skipped (not staged)`); continue; }
    if (opts.stage && entry?.status === "published") { io.out(`${id}: skipped (already published)`); continue; }
    if (id !== "hn" && entry?.approvedHash !== approvalHash(draft, config)) { io.out(`${id}: refused: draft is not approved or has changed`); failed = true; continue; }
    if (entry?.status === "unknown" || entry?.status === "pending" || entry?.lastAttempt?.status === "unknown") { io.out(`${id}: refused: unknown outcome; resolve with mark`); failed = true; continue; }
    if (entry?.status === "published" && (id === "hn" || entry.contentHash === approvalHash(draft, config))) { io.out(`${id}: published (skipped)`); continue; }
    const mode = modeOf(id, config, env);
    if (entry?.status === "handoff" && mode.mode === "api" && !opts.force) { io.out(`${id}: refused: prior handoff; mark it or use --force`); failed = true; continue; }
    if (entry?.status === "published" && META[id].kind === "social" && !opts.force) { io.out(`${id}: refused: changed social post requires --force`); failed = true; continue; }
    if (mode.mode === "missing") { io.out(`${id}: refused: missing ${mode.missing.join(", ")}`); failed = true; continue; }
    eligible.push(id);
  }
  if (!opts.yes) {
    for (const id of eligible) {
      const post = resolved(draftFor(id), config, state, true);
      const adapter = adapters[id];
      const mode = modeOf(id, config, env).mode;
      const cost = mode === "api" ? adapter.cost?.(post) : undefined;
      const payload = mode === "handoff" ? adapter.handoff?.(post, ctx) : adapter.payload(post, ctx, { stage: !!opts.stage });
      io.out(`${id}: ${mode}${cost === undefined ? "" : ` expected cost $${cost.toFixed(2)}`} text: ${post.body} payload: ${JSON.stringify(payload)}`);
    }
    return failed ? 1 : 0;
  }
  let preflightFailed = false;
  for (const id of eligible) {
    if (modeOf(id, config, env).mode === "api") {
      try {
        if (adapters[id].verify) await adapters[id].verify!(ctx);
        else io.out(`${id}: preflight: no read check available`);
      } catch (err) { io.out(`${id}: preflight failed: ${redact(String((err as Error).message ?? err), env, ALL_ENV_VARS)}`); preflightFailed = true; }
    }
  }
  for (const id of eligible) {
    const draft = draftFor(id);
    const length = measureBody(id, resolveLinks(draft.body, publishedUrls(state), { worstCase: true }), ctx.config);
    if (length && length.length > length.max) { io.out(`${id}: preflight failed: ${length.length}/${length.max} ${length.unit}`); preflightFailed = true; }
  }
  if (preflightFailed) return 1;
  for (const id of eligible) {
    const draft = draftFor(id);
    const entry = state[id];
    const adapter = adapters[id];
    const dependencies = [...linksIn(draft.title ?? ""), ...linksIn(draft.body), ...(usesCanonical(id) ? linksIn(draft.canonical ?? "") : [])];
    if (!draft.canonical && usesCanonical(id) && home && isDestinationId(home) && home !== id) dependencies.push(home);
    const blocked = dependencies.find((target) => !isDestinationId(target) || state[target]?.status !== "published" || !state[target]?.url);
    if (blocked || (id === "hn" && (!home || (!isDestinationId(home) && !/^https?:\/\//i.test(home))))) {
      const error = blocked ? `link target ${blocked} is not published` : "canonical home is not published";
      updateState(campaign, state, id, { status: "blocked", error }); io.out(`${id}: blocked: ${error}`); failed = true; continue;
    }
    const post = resolved(draft, config, state, false);
    if (modeOf(id, config, env).mode === "handoff") {
      try {
        if (!adapter.handoff) throw new Error("adapter has no handoff");
        const info = adapter.handoff(post, ctx);
        if (opts.open) {
          if (META[id].ai === "draft") {
            const command = process.platform === "darwin" ? ["pbcopy"] : process.platform === "win32" ? ["clip"] : ["xclip", "-selection", "clipboard"];
            try { await io.run(command[0], command.slice(1), { input: post.body }); } catch (err) { io.out(`${id}: warning: clipboard: ${(err as Error).message}`); }
          }
          if (info.url) {
            const command = process.platform === "darwin" ? ["open", info.url] : process.platform === "win32" ? ["cmd", "/c", "start", "", info.url] : ["xdg-open", info.url];
            try { await io.run(command[0], command.slice(1)); } catch (err) { io.out(`${id}: warning: open: ${(err as Error).message}`); }
          }
        }
        if (entry?.status !== "published") updateState(campaign, state, id, { status: "handoff", contentHash: post.contentHash, error: undefined });
        io.out(`${id}: handoff (prefills ${info.prefills})${info.url ? ` ${info.url}` : ""} text: ${post.body}`);
      } catch (err) { const error = redact(String((err as Error).message ?? err), env, ALL_ENV_VARS); updateState(campaign, state, id, { status: "failed", error }); io.out(`${id}: failed: ${error}`); failed = true; }
      continue;
    }
    const stage = !!opts.stage;
    const updating = !!entry?.id && META[id].kind === "article";
    if (updating && (entry?.status === "published" || entry?.status === "staged")) {
      updateState(campaign, state, id, { lastAttempt: { status: "unknown", error: "request outcome not yet known" }, error: undefined });
    } else updateState(campaign, state, id, { status: "pending", error: undefined });
    try {
      let result;
      for (let attempt = 0; ; attempt++) {
        try {
          if (updating) {
            if (!adapter.update) throw new Error("adapter cannot update existing article");
            result = await adapter.update(entry!.id!, post, ctx, { stage });
          } else {
            if (!adapter.create) throw new Error("adapter cannot create posts");
            result = await adapter.create(post, ctx, { stage });
          }
          break;
        } catch (err) {
          if (attempt >= 2 || !(err instanceof HttpError && err.status === 429 || connectionRefused(err))) throw err;
          await (opts.sleep ?? delay)(retryDelay(err, attempt));
        }
      }
      const status = result.staged || stage ? "staged" : "published";
      updateState(campaign, state, id, { status, id: result.id, url: result.url, contentHash: post.contentHash, error: undefined, lastAttempt: undefined });
      io.out(`${id}: ${status} ${result.url}`);
    } catch (err) {
      const status = uncertain(err) ? "unknown" : "failed";
      const error = redact(String((err as Error).message ?? err), env, ALL_ENV_VARS);
      if (updating && (entry?.status === "published" || entry?.status === "staged")) updateState(campaign, state, id, { error, lastAttempt: { status, error } });
      else updateState(campaign, state, id, { status, error });
      io.out(`${id}: ${status}: ${error}`); failed = true;
    }
  }
  return failed ? 1 : 0;
}
