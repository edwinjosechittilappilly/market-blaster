import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { isDestinationId } from "./links.ts";
import { UserError, type DestinationId } from "./types.ts";

export interface StudioMedia { path: string; alt: string; kind: string; cover?: boolean; lang?: string; captions?: string }
export interface StudioPost {
  platform: string; destination: DestinationId; title?: string; body: string; evidence: string[]; tags?: string[];
  disclosure?: { text?: string; media?: string; voice?: string }; media: StudioMedia[]; thread?: string[];
  review: { verdict: string; total: number | null; reviewHash: string };
}
export interface StudioManifest { version: 1; slug: string; generatedAt: string; brief: "brief.md"; posts: StudioPost[] }

export interface CampaignDestination {
  id: DestinationId; mode: "api" | "handoff"; aiPolicy: string; post: string | null;
  media: StudioMedia[]; thread: string | null; tags?: string[];
  review: { verdict: string; total: number | null; reviewHash: string } | null;
}
export interface CampaignManifest {
  version: 2; kind: "blast-studio-campaign"; slug: string; title: string; generatedAt: string;
  generator: { name: string; version: string }; canonicalHome: string | null;
  sources: { anchor: string; title: string; status: string | null; url?: string | null }[];
  destinations: CampaignDestination[];
  manual: { platform: string; folder: string; review: { verdict: string; total: number | null } | null }[];
}

export function reviewHash(post: { title?: string; body: string; media: StudioMedia[] }): string {
  return createHash("sha256").update(`${post.title ?? ""}\n---\n${post.body.trim()}\n---\n${post.media.map((m) => `${basename(m.path)}|${m.alt.trim()}`).join("\n")}`).digest("hex");
}

const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");

/** Validate media fields shared by drafts and both manifest versions. */
export function validateMedia(value: unknown): value is StudioMedia {
  return object(value) && typeof value.path === "string" && typeof value.alt === "string"
    && typeof value.kind === "string" && (value.cover === undefined || typeof value.cover === "boolean")
    && (value.lang === undefined || (typeof value.lang === "string" && /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(value.lang)))
    && (value.captions === undefined || (value.kind === "video" && typeof value.captions === "string" && /\.vtt$/i.test(value.captions)));
}

/** Resolve a regular package file without allowing path traversal or symlink escapes. */
export function packageFile(root: string, path: string): string {
  if (!path || isAbsolute(path)) throw new UserError(`invalid package path: ${path}`);
  try {
    const base = realpathSync(root);
    const file = realpathSync(resolve(base, path));
    const rel = relative(base, file);
    if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !statSync(file).isFile()) throw new Error();
    return file;
  } catch { throw new UserError(`invalid or missing package file: ${path}`); }
}

export function loadManifest(root: string): StudioManifest {
  let value: unknown;
  try { value = JSON.parse(readFileSync(packageFile(root, "manifest.json"), "utf8")); }
  catch (err) { throw new UserError(`invalid Studio manifest: ${(err as Error).message}`); }
  if (!object(value) || value.version !== 1) throw new UserError("unsupported or invalid Studio manifest version");
  if (typeof value.slug !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(value.slug)
    || typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))
    || value.brief !== "brief.md" || !Array.isArray(value.posts)) throw new UserError("invalid Studio manifest fields");
  const seen = new Set<string>();
  for (const post of value.posts) {
    if (!object(post) || typeof post.platform !== "string" || !post.platform.trim()
      || typeof post.destination !== "string" || !isDestinationId(post.destination) || seen.has(post.destination)
      || (post.title !== undefined && typeof post.title !== "string") || typeof post.body !== "string"
      || !strings(post.evidence) || !Array.isArray(post.media)
      || post.media.some((m: unknown) => !validateMedia(m) || !m.path || !m.kind)
      || (post.thread !== undefined && !strings(post.thread))
      || (post.tags !== undefined && !strings(post.tags))
      || (post.disclosure !== undefined && (!object(post.disclosure) || Object.entries(post.disclosure).some(([k, v]) =>
        !["text", "media", "voice"].includes(k) || typeof v !== "string")))
      || !object(post.review) || !["pass", "accepted", "revise", "blocked"].includes(String(post.review.verdict))
      || (post.review.total !== null && (typeof post.review.total !== "number" || !Number.isFinite(post.review.total) || post.review.total < 0 || post.review.total > 100))
      || typeof post.review.reviewHash !== "string" || !/^[a-f0-9]{64}$/.test(post.review.reviewHash)) {
      throw new UserError("invalid Studio manifest post");
    }
    seen.add(post.destination);
  }
  return value as unknown as StudioManifest;
}

export function loadCampaignManifest(root: string): CampaignManifest {
  let value: unknown;
  try { value = JSON.parse(readFileSync(packageFile(root, "campaign.json"), "utf8")); }
  catch (err) { throw new UserError(`invalid campaign manifest: ${(err as Error).message}`); }
  const review = (r: unknown, hash: boolean) => r === null || (object(r)
    && typeof r.verdict === "string" && (r.total === null || (typeof r.total === "number" && Number.isFinite(r.total) && r.total >= 0 && r.total <= 100))
    && (!hash || (typeof r.reviewHash === "string" && /^[a-f0-9]{64}$/.test(r.reviewHash))));
  const media = (m: unknown) => validateMedia(m) && !!m.path && ["image", "video", "gif", "document"].includes(m.kind);
  if (!object(value) || value.version !== 2 || value.kind !== "blast-studio-campaign"
    || typeof value.slug !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(value.slug)
    || typeof value.title !== "string" || typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))
    || !object(value.generator) || typeof value.generator.name !== "string" || typeof value.generator.version !== "string"
    || (value.canonicalHome !== null && typeof value.canonicalHome !== "string")
    || !Array.isArray(value.sources) || value.sources.some((s: unknown) => !object(s) || typeof s.anchor !== "string"
      || typeof s.title !== "string" || (s.status !== null && typeof s.status !== "string") || (s.url !== undefined && s.url !== null && typeof s.url !== "string"))
    || !Array.isArray(value.destinations) || !Array.isArray(value.manual)) throw new UserError("invalid campaign manifest fields");
  const seen = new Set<string>();
  for (const d of value.destinations) {
    if (!object(d) || typeof d.id !== "string" || !isDestinationId(d.id) || seen.has(d.id)
      || !["api", "handoff"].includes(String(d.mode)) || typeof d.aiPolicy !== "string"
      || (d.post !== null && (typeof d.post !== "string" || !d.post))
      || !Array.isArray(d.media) || d.media.some((m: unknown) => !media(m))
      || (d.thread !== null && (typeof d.thread !== "string" || !d.thread))
      || (d.tags !== undefined && !strings(d.tags))
      || !review(d.review, true)) throw new UserError("invalid campaign destination");
    seen.add(d.id);
  }
  for (const m of value.manual) {
    if (!object(m) || typeof m.platform !== "string" || !m.platform
      || typeof m.folder !== "string" || !m.folder.startsWith("handoff/") || !review(m.review, false))
      throw new UserError("invalid campaign manual platform");
  }
  return value as unknown as CampaignManifest;
}
