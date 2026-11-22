import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { isDestinationId } from "./links.ts";
import { UserError, type DestinationId, type Draft } from "./types.ts";

export function draftsDir(campaign: string): string {
  return join(campaign, "drafts");
}

export function draftPath(campaign: string, dest: DestinationId): string {
  return join(draftsDir(campaign), `${dest}.md`);
}

/** Splits `---\n<yaml>\n---\n<body>`; throws UserError with the file path on malformed input. */
export function parseDraft(path: string, text: string): Draft {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new UserError(`${path}: missing YAML frontmatter (--- ... ---)`);
  let front: Record<string, unknown>;
  try {
    front = (parse(m[1]) ?? {}) as Record<string, unknown>;
  } catch (err) {
    throw new UserError(`${path}: invalid frontmatter: ${(err as Error).message}`);
  }
  const destination = String(front.destination ?? "");
  if (!isDestinationId(destination)) throw new UserError(`${path}: unknown or missing destination "${destination}"`);
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : []);
  if (front.media !== undefined && (!Array.isArray(front.media) || front.media.some((item: unknown) =>
    !item || typeof item !== "object" || Array.isArray(item)
    || typeof (item as Record<string, unknown>).path !== "string"
    || typeof (item as Record<string, unknown>).alt !== "string"
    || typeof (item as Record<string, unknown>).kind !== "string"
    || ((item as Record<string, unknown>).cover !== undefined && typeof (item as Record<string, unknown>).cover !== "boolean")
    || ((item as Record<string, unknown>).lang !== undefined && (typeof (item as Record<string, unknown>).lang !== "string"
      || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test((item as Record<string, unknown>).lang as string)))
    || ((item as Record<string, unknown>).captions !== undefined && ((item as Record<string, unknown>).kind !== "video"
      || typeof (item as Record<string, unknown>).captions !== "string" || !/\.vtt$/i.test((item as Record<string, unknown>).captions as string)))))) {
    throw new UserError(`${path}: invalid media frontmatter`);
  }
  if (front.studio !== undefined && (!front.studio || typeof front.studio !== "object"
    || Array.isArray(front.studio) || typeof (front.studio as Record<string, unknown>).reviewHash !== "string"
    || typeof (front.studio as Record<string, unknown>).verdict !== "string")) {
    throw new UserError(`${path}: invalid studio frontmatter`);
  }
  return {
    destination,
    title: front.title == null ? undefined : String(front.title),
    tags: front.tags == null ? undefined : list(front.tags),
    canonical: front.canonical == null ? undefined : String(front.canonical),
    skip: front.skip == null ? undefined : String(front.skip),
    evidence: list(front.evidence),
    media: front.media as Draft["media"],
    studio: front.studio as Draft["studio"],
    body: m[2].trim(),
    path,
  };
}

/** Every `drafts/*.md` in the campaign, keyed by destination. */
export function loadDrafts(campaign: string): Map<DestinationId, Draft> {
  const dir = draftsDir(campaign);
  const drafts = new Map<DestinationId, Draft>();
  if (!existsSync(dir)) return drafts;
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".md")) continue;
    const path = join(dir, name);
    const draft = parseDraft(path, readFileSync(path, "utf8"));
    if (`${draft.destination}.md` !== name) {
      throw new UserError(`${path}: destination "${draft.destination}" does not match the file name`);
    }
    drafts.set(draft.destination, draft);
  }
  return drafts;
}
