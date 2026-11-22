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
  return {
    destination,
    title: front.title == null ? undefined : String(front.title),
    tags: front.tags == null ? undefined : list(front.tags),
    canonical: front.canonical == null ? undefined : String(front.canonical),
    evidence: list(front.evidence),
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
