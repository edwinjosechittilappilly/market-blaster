import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { checkCampaign } from "./check.ts";
import { ALL_ENV_VARS, META, publishOrder } from "./destinations/meta.ts";
import { newsletterTargets } from "./destinations/handoffs.ts";
import { modeOf } from "./destinations/mode.ts";
import { redact } from "./env.ts";
import type { IO } from "./io.ts";
import { measureBody } from "./limits.ts";
import { isDestinationId, linksIn, resolveLinks } from "./links.ts";
import { approvalHash, loadState, needsApproval, updateState, withStateLock } from "./state.ts";
import {
  HttpError, MediaUploadError, UserError, type CampaignState, type Config, type Ctx, type Destination,
  type DestinationId, type Draft, type Env, type ResolvedPost,
} from "./types.ts";

interface PublishOptions {
  config: Config; campaign: string; env: Env; io: IO;
  adapters: Record<DestinationId, Destination>; yes?: boolean; stage?: boolean; force?: boolean; open?: boolean;
  only?: DestinationId[]; sleep?: (ms: number) => Promise<void>; crosspost?: Ctx["crosspost"]; json?: boolean;
}

function publishedUrls(state: CampaignState): Partial<Record<DestinationId, string>> {
  const urls: Partial<Record<DestinationId, string>> = {};
  for (const [id, entry] of Object.entries(state)) {
    if (entry.status === "published" && entry.url && isDestinationId(id)) urls[id] = entry.url;
  }
  return urls;
}
/** Destinations that link to (and so depend on) the canonical home:
 * article canonical fields, HN/Reddit links, Discussions.
 */
const usesCanonical = (id: DestinationId) => ["devto", "hashnode", "hn", "reddit", "github-discussion"].includes(id);
export function resolved(draft: Draft, config: Config, state: CampaignState, pending: boolean): ResolvedPost {
  const urls: Record<string, string> = { ...publishedUrls(state) };
  if (pending) for (const id of config.destinations) if (!urls[id]) urls[id] = `<pending:${id}>`;
  const home = config.canonicalHome;
  const canonical = usesCanonical(draft.destination)
    ? draft.canonical ?? (home && home !== draft.destination ? (isDestinationId(home) ? urls[home] : home) : undefined)
    : undefined;
  return {
    destination: draft.destination,
    title: draft.title ? resolveLinks(draft.title, urls) : undefined,
    tags: draft.tags,
    body: resolveLinks(draft.body, urls),
    media: draft.media?.flatMap((media) => {
      const base = dirname(dirname(draft.path));
      const item = { ...media, path: resolve(base, media.path), captions: media.captions ? resolve(base, media.captions) : undefined };
      return draft.destination === "bluesky" && media.captions
        ? [item, { path: resolve(base, media.captions), alt: media.alt, kind: "vtt", lang: media.lang }] : [item];
    }),
    canonical: canonical ? resolveLinks(canonical, urls) : undefined,
    contentHash: approvalHash(draft, config),
  };
}
function connectionRefused(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "ECONNREFUSED" || e?.cause?.code === "ECONNREFUSED";
}
function uncertain(err: unknown): boolean {
  if (err instanceof UserError) return false;
  return !(err instanceof HttpError && err.status >= 400 && err.status < 500);
}

function retryDelay(err: unknown, attempt: number): number {
  const value = (err as { retryAfter?: string }).retryAfter;
  if (value && /^\d+(?:\.\d+)?$/.test(value)) return Math.min(30_000, Number(value) * 1000);
  return 100 * 2 ** attempt;
}

function previewText(text: string): string {
  const lines = text.split("\n");
  return lines.slice(0, 3).join("\n         ") + (lines.length > 3 ? ` … ${lines.length - 3} more lines` : "");
}

function handoffBlock(id: DestinationId, post: ResolvedPost, info: { url?: string; prefills: string }): string {
  const url = info.url && (info.url.length > 100 ? `${info.url.slice(0, 99)}…` : info.url);
  const prefills = info.prefills === "full" ? "full text" : info.prefills === "link" ? "link" : "nothing";
  const ai = META[id].ai;
  const text =
    ai === "none" ? "(none: write it yourself; HN forbids generated text)"
    : ai === "outline" ? `talking points, write the post yourself:\n         ${previewText(post.body)}`
    : previewText(post.body);
  const title = post.title ? `\n  title: ${post.title}` : "";
  return `${id}  handoff  (compose link, prefills ${prefills})${title}\n  text:  ${text}` +
    `${post.media?.length ? `\n  attach:\n${post.media.flatMap((media) => [
      `    ${media.path}`, ...(media.captions ? [`    ${media.captions}`] : []),
    ]).join("\n")}` : ""}` +
    `${url ? `\n  open:  ${url}` : ""}`;
}

function apiBlock(id: DestinationId, post: ResolvedPost, payload: unknown, cost?: number): string {
  const article = id === "devto" && payload && typeof payload === "object" && "article" in payload &&
    payload.article && typeof payload.article === "object" ? payload.article : undefined;
  const published = article && "published" in article && article.published === true;
  const tags = article && "tags" in article ? article.tags : [];
  const description = article ? `article, ${published ? "published" : "unpublished"} on DEV` : META[id].kind;
  const fields = payload && typeof payload === "object" ? Object.keys(payload).join(", ") : "";
  const sends = article
    ? `POST https://dev.to/api/articles  {title, body_markdown, published:${published}, tags:${JSON.stringify(tags)}}`
    : `request fields: {${fields}}`;
  return `${id}  api  (${description})${cost === undefined ? "" : ` expected cost $${cost.toFixed(2)}`}` +
    `${post.title ? `\n  title: ${post.title}` : ""}\n  text:  ${previewText(post.body)}\n  sends: ${sends}`;
}

export async function publishCampaign(opts: PublishOptions): Promise<number> {
  return withStateLock(opts.campaign, () => publishLocked(opts));
}

async function publishLocked(opts: PublishOptions): Promise<number> {
  const { config, campaign, env, io, adapters } = opts;
  const ctx: Ctx = {
    config: { ...config, mastodon: { ...config.mastodon } }, env, fetch: io.fetch, timeoutMs: 30_000,
    run: io.run, crosspost: opts.crosspost,
  };
  const checkOnly = opts.stage
    ? config.destinations.filter(
      (id) => (id === "devto" || id === "hashnode") && (!opts.only || opts.only.includes(id)),
    )
    : opts.only;
  const checked = checkCampaign(config, campaign, { only: checkOnly });
  for (const finding of checked.findings) io.out(`${finding.destination}: ${finding.level}: ${finding.message}`);
  if (checked.findings.some((finding) => finding.level === "error")) return 1;
  const order = publishOrder(
    config.destinations.filter((id) => !opts.only || opts.only.includes(id)), config.canonicalHome,
  );
  const state = loadState(campaign);
  const home = config.canonicalHome;
  // Published title from state once the home is live; before that (dry run, first run) the approved home draft's title.
  const homeTitle = home && isDestinationId(home)
    ? (state[home]?.title ?? checked.drafts.get(home)?.title) : config.hn?.title;
  const hnDraft: Draft = { destination: "hn", title: homeTitle, evidence: [], body: "", path: "" };
  const draftFor = (id: DestinationId) => id === "hn" ? hnDraft : checked.drafts.get(id)!;
  const destinationMode = (id: DestinationId) => id === "linkedin" && draftFor(id)?.media?.some(
    (media) => media.kind === "pdf" || /\.pdf$/i.test(media.path),
  ) ? { mode: "handoff" as const } : modeOf(id, config, env);
  const eligible: DestinationId[] = [];
  let failed = false;
  for (const id of order) {
    const draft = draftFor(id);
    const entry = state[id];
    if (draft?.skip) { io.out(`${id}: skipped (${draft.skip})`); continue; }
    if (opts.stage && id !== "devto" && id !== "hashnode") { io.out(`${id}: skipped (not staged)`); continue; }
    if (opts.stage && entry?.status === "published") { io.out(`${id}: skipped (already published)`); continue; }
    if (needsApproval(id) && entry?.approvedHash !== approvalHash(draft, config)) {
      io.out(`${id}: refused: draft is not approved or has changed`); failed = true; continue;
    }
    if (entry?.status === "unknown" || entry?.status === "pending" || entry?.lastAttempt?.status === "unknown") {
      io.out(`${id}: refused: unknown outcome; resolve with mark`); failed = true; continue;
    }
    if (entry?.status === "published" && (id === "hn" || entry.contentHash === approvalHash(draft, config))) {
      io.out(`${id}: published (skipped)`); continue;
    }
    const mode = destinationMode(id);
    if (entry?.status === "handoff" && mode.mode === "api" && !opts.force) {
      io.out(`${id}: refused: prior handoff; mark it or use --force`); failed = true; continue;
    }
    if (entry?.status === "published" && META[id].kind === "social" && !opts.force) {
      io.out(`${id}: refused: changed social post requires --force`); failed = true; continue;
    }
    if (mode.mode === "missing") {
      io.out(`${id}: refused: missing ${mode.missing.join(", ")}`); failed = true; continue;
    }
    eligible.push(id);
  }
  if (!opts.yes) {
    for (const id of eligible) {
      const post = resolved(draftFor(id), config, state, true);
      const adapter = adapters[id];
      const mode = destinationMode(id).mode;
      const cost = mode === "api" ? adapter.cost?.(post) : undefined;
      try {
        const payload = mode === "handoff"
          ? adapter.handoff?.(post, ctx) : adapter.payload(post, ctx, { stage: !!opts.stage });
        const output = opts.json
          ? JSON.stringify({ destination: id, mode, post, payload, ...(cost === undefined ? {} : { cost }) })
          : mode === "handoff" ? handoffBlock(id, post, payload as { url?: string; prefills: string })
          : apiBlock(id, post, payload, cost);
        io.out(redact(output, env, ALL_ENV_VARS));
      } catch (err) {
        io.out(`${id}: error: ${redact(String((err as Error).message ?? err), env, ALL_ENV_VARS)}`); failed = true;
      }
    }
    return failed ? 1 : 0;
  }
  let preflightFailed = false;
  for (const id of eligible) {
    if (destinationMode(id).mode === "api") {
      try {
        if (adapters[id].verify) await adapters[id].verify!(ctx);
        else io.out(`${id}: preflight: verify unavailable (no read check available)`);
        await adapters[id].preflight?.(resolved(draftFor(id), config, state, true), ctx);
      } catch (err) {
        io.out(`${id}: preflight failed: ${redact(String((err as Error).message ?? err), env, ALL_ENV_VARS)}`);
        preflightFailed = true;
      }
    }
  }
  for (const id of eligible) {
    const draft = draftFor(id);
    const length = measureBody(id, resolveLinks(draft.body, publishedUrls(state), { worstCase: true }), ctx.config);
    if (length && length.length > length.max) {
      io.out(`${id}: preflight failed: ${length.length}/${length.max} ${length.unit}`); preflightFailed = true;
    }
  }
  if (preflightFailed) return 1;
  for (const id of eligible) {
    const draft = draftFor(id);
    if (id === "hn") {
      draft.title = home && isDestinationId(home)
        ? state[home]?.title ?? checked.drafts.get(home)?.title : config.hn?.title;
      if (!draft.title) {
        io.out(home && !isDestinationId(home) ? "hn: skipped: canonical title unavailable; set hn.title"
          : "hn: skipped: canonical home draft title unavailable");
        failed = true; continue;
      }
    }
    const entry = state[id];
    const adapter = adapters[id];
    const dependencies = [
      ...linksIn(draft.title ?? ""), ...linksIn(draft.body),
      ...(usesCanonical(id) ? linksIn(draft.canonical ?? "") : []),
    ];
    if (!draft.canonical && usesCanonical(id) && home && isDestinationId(home) && home !== id) dependencies.push(home);
    const blocked = dependencies.find(
      (target) => !isDestinationId(target) || state[target]?.status !== "published" || !state[target]?.url,
    );
    if (blocked || (id === "hn" && (!home || (!isDestinationId(home) && !/^https?:\/\//i.test(home))))) {
      const error = blocked ? `link target ${blocked} is not published` : "canonical home is not published";
      updateState(campaign, state, id, { status: "blocked", error });
      io.out(`${id}: blocked: ${error}`); failed = true; continue;
    }
    const post = resolved(draft, config, state, false);
    if (destinationMode(id).mode === "handoff") {
      try {
        if (!adapter.handoff) throw new Error("adapter has no handoff");
        const info = adapter.handoff(post, ctx);
        if (id === "newsletter") {
          for (const target of newsletterTargets(config)) io.out(`${target.name}: compose ${target.url}`);
        }
        if (opts.open) {
          if (META[id].ai === "draft") {
            const command = process.platform === "darwin" ? ["pbcopy"]
              : process.platform === "win32" ? ["clip"] : ["xclip", "-selection", "clipboard"];
            try { await io.run(command[0], command.slice(1), { input: post.body }); }
            catch (err) { io.out(`${id}: warning: clipboard: ${(err as Error).message}`); }
          }
          if (info.url) {
            const command = process.platform === "darwin" ? ["open", info.url]
              : process.platform === "win32" ? ["cmd", "/c", "start", "", info.url] : ["xdg-open", info.url];
            try { await io.run(command[0], command.slice(1)); }
            catch (err) { io.out(`${id}: warning: open: ${(err as Error).message}`); }
          }
        }
        if (entry?.status !== "published") {
          updateState(campaign, state, id, { status: "handoff", contentHash: post.contentHash, error: undefined });
        }
        io.out(redact(handoffBlock(id, post, info), env, ALL_ENV_VARS));
      } catch (err) {
        const error = redact(String((err as Error).message ?? err), env, ALL_ENV_VARS);
        updateState(campaign, state, id, { status: "failed", error }); io.out(`${id}: failed: ${error}`); failed = true;
      }
      continue;
    }
    const stage = !!opts.stage;
    const updating = !!entry?.id && META[id].kind === "article";
    if (updating && (entry?.status === "published" || entry?.status === "staged")) {
      updateState(campaign, state, id, {
        lastAttempt: { status: "unknown", error: "request outcome not yet known" }, error: undefined,
      });
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
          if (err instanceof MediaUploadError || attempt >= 2 || !(err instanceof HttpError && err.status === 429 || connectionRefused(err))) throw err;
          await (opts.sleep ?? delay)(retryDelay(err, attempt));
        }
      }
      const status = result.staged || stage ? "staged" : "published";
      updateState(campaign, state, id, {
        status, id: result.id, url: result.url, title: post.title, contentHash: post.contentHash,
        error: undefined, lastAttempt: undefined,
      });
      io.out(`${id}: ${status} ${result.url}`);
    } catch (err) {
      const status = !(err instanceof MediaUploadError) && uncertain(err) ? "unknown" : "failed";
      const error = redact(String((err as Error).message ?? err), env, ALL_ENV_VARS);
      if (updating && (entry?.status === "published" || entry?.status === "staged")) {
        updateState(campaign, state, id, { error, lastAttempt: { status, error } });
      }
      else updateState(campaign, state, id, { status, error });
      io.out(`${id}: ${status}: ${error}`); failed = true;
    }
  }
  return failed ? 1 : 0;
}
