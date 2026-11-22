import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { isDestinationId } from "./links.ts";
import { UserError, type DestinationId } from "./types.ts";

export interface StudioMedia { path: string; alt: string; kind: string; cover?: boolean; lang?: string; captions?: string }
export interface StudioPost {
  platform: string; destination: DestinationId; title?: string; body: string; evidence: string[];
  disclosure?: { text?: string; media?: string; voice?: string }; media: StudioMedia[]; thread?: string[];
  review: { verdict: string; total: number | null; reviewHash: string };
}
export interface StudioManifest { version: 1; slug: string; generatedAt: string; brief: "brief.md"; posts: StudioPost[] }

export function reviewHash(post: { title?: string; body: string; media: StudioMedia[] }): string {
  return createHash("sha256").update(`${post.title ?? ""}\n---\n${post.body.trim()}\n---\n${post.media.map((m) => `${basename(m.path)}|${m.alt.trim()}`).join("\n")}`).digest("hex");
}

const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");

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
      || post.media.some((m: unknown) => !object(m) || typeof m.path !== "string" || !m.path
        || typeof m.alt !== "string" || typeof m.kind !== "string" || !m.kind
        || (m.cover !== undefined && typeof m.cover !== "boolean")
        || (m.lang !== undefined && (typeof m.lang !== "string" || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(m.lang)))
        || (m.captions !== undefined && (m.kind !== "video" || typeof m.captions !== "string" || !/\.vtt$/i.test(m.captions))))
      || (post.thread !== undefined && !strings(post.thread))
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
