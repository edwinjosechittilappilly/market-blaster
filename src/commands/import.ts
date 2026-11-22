import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse, stringify } from "yaml";
import { extractCampaignZip } from "../campaign-zip.ts";
import { checkCampaign } from "../check.ts";
import { campaignDir, loadConfig } from "../config.ts";
import { draftPath, parseDraft } from "../drafts.ts";
import type { Command, IO } from "../io.ts";
import { loadCampaignManifest, loadManifest, packageFile } from "../manifest.ts";
import { loadState, saveState, withStateLock } from "../state.ts";
import { UserError, type Config, type DestinationId } from "../types.ts";

async function writeImport(
  campaign: string, config: Config, io: IO, force: boolean | undefined,
  destinations: DestinationId[], skipped: DestinationId[], paths: string[], write: () => void,
  report?: () => void,
): Promise<number> {
  return withStateLock(campaign, async () => {
    const state = loadState(campaign);
    const approved = [...new Set(destinations)].filter((id) => state[id]?.approvedHash);
    if (approved.length && !force) throw new UserError(`approved drafts would be overwritten: ${approved.join(", ")}; use --force`);
    const replaced = [...new Set(paths)].filter((path) => existsSync(join(campaign, path))).sort();
    if (replaced.length) {
      io.err("Warning: import will replace existing files:");
      for (const path of replaced) io.err(`  ${path}`);
    }
    if (approved.length) {
      for (const id of approved) delete state[id]!.approvedHash;
      saveState(campaign, state);
    }
    write();
    for (const id of skipped) {
      const path = draftPath(campaign, id);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `---\n${stringify({ destination: id, skip: "not planned in studio" })}---\n`);
    }
    const { findings } = checkCampaign(config, campaign);
    for (const f of findings) io.out(`${f.destination}  ${f.level}  ${f.message}`);
    const errors = findings.filter((f) => f.level === "error").length;
    io.out(`${errors} error(s), ${findings.length - errors} warning(s)`);
    report?.();
    return errors ? 1 : 0;
  });
}

function packageFiles(root: string, folder: string): string[] {
  const path = join(root, folder);
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [folder];
  return readdirSync(path).flatMap((name) => packageFiles(root, join(folder, name)));
}

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    slug: { type: "string" }, force: { type: "boolean" },
  } });
  if (positionals.length !== 1) throw new UserError("usage: mblast import <dir|file.zip> [--slug s] [--force]");
  const root = resolve(io.cwd, positionals[0]);
  let input;
  try { input = statSync(root); }
  catch (err) {
    if (["ENOENT", "ENOTDIR"].includes((err as NodeJS.ErrnoException).code ?? "")) throw new UserError(`import path not found: ${positionals[0]}`);
    throw err;
  }
  if (!input.isDirectory()) {
    if (!input.isFile() || !root.toLowerCase().endsWith(".zip")) throw new UserError(`import path must be a directory or .zip file: ${positionals[0]}`);
    const temp = mkdtempSync(join(tmpdir(), "mblast-import-"));
    try {
      extractCampaignZip(root, temp);
      return await importCampaignZip(temp, io, values.slug, values.force);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }
  const manifest = loadManifest(root);
  const config = loadConfig(io.cwd);
  const campaign = campaignDir(config, values.slug ?? manifest.slug);
  const brief = readFileSync(packageFile(root, manifest.brief), "utf8");
  const prepared = manifest.posts.map((post) => ({ post, media: post.media.map((item) => {
    const source = packageFile(root, item.path);
    const dir = createHash("sha256").update(item.path).digest("hex").slice(0, 16);
    const captionSource = item.captions ? packageFile(root, item.captions) : undefined;
    const captions = item.captions ? `media/${createHash("sha256").update(item.captions).digest("hex").slice(0, 16)}/${basename(item.captions)}` : undefined;
    return { source, path: `media/${dir}/${basename(item.path)}`, alt: item.alt, kind: item.kind,
      cover: item.cover, lang: item.lang, captions, captionSource };
  }) }));
  const skipped = config.destinations.filter((id) => !manifest.posts.some((post) => post.destination === id));
  const paths = ["brief.md", ...[...manifest.posts.map((post) => post.destination), ...skipped].map((id) => `drafts/${id}.md`),
    ...prepared.flatMap(({ post, media }) => [
      ...media.flatMap((item) => [item.path, ...(item.captions ? [item.captions] : [])]),
      ...(post.thread?.length ? [`handoff/${post.destination}-thread.md`] : []),
    ])];
  return writeImport(campaign, config, io, values.force,
    [...config.destinations, ...manifest.posts.map((post) => post.destination)], skipped, paths, () => {
    writeFileSync(join(campaign, "brief.md"), brief);
    for (const { post, media } of prepared) {
      for (const item of media) {
        const target = join(campaign, item.path);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(item.source, target);
        if (item.captions && item.captionSource) {
          const captionTarget = join(campaign, item.captions);
          mkdirSync(dirname(captionTarget), { recursive: true });
          copyFileSync(item.captionSource, captionTarget);
        }
      }
      const front = { destination: post.destination, ...(post.title === undefined ? {} : { title: post.title }),
        evidence: post.evidence, media: media.map(({ source, captionSource, ...item }) => item),
        ...(post.disclosure === undefined ? {} : { disclosure: post.disclosure }),
        studio: { reviewHash: post.review.reviewHash, verdict: post.review.verdict } };
      const path = draftPath(campaign, post.destination);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `---\n${stringify(front)}---\n${post.body.trim()}\n`);
      if (post.thread?.length) {
        const handoff = join(campaign, "handoff", `${post.destination}-thread.md`);
        mkdirSync(dirname(handoff), { recursive: true });
        writeFileSync(handoff, [post.body.trim(), ...post.thread].join("\n\n---\n\n") + "\n");
      }
    }
  });
};

async function importCampaignZip(root: string, io: IO, slug: string | undefined, force: boolean | undefined): Promise<number> {
  const manifest = loadCampaignManifest(root);
  const config = loadConfig(io.cwd);
  const campaign = campaignDir(config, slug ?? manifest.slug);
  const brief = readFileSync(packageFile(root, "brief.md"), "utf8");
  const enabled = new Set(config.destinations);
  const imported = manifest.destinations.filter((d) => enabled.has(d.id));
  const unavailable = manifest.destinations.filter((d) => !enabled.has(d.id));
  const skipped = config.destinations.filter((id) => !manifest.destinations.some((d) => d.id === id));
  const prepared = imported.map((d) => {
    for (const media of d.media) {
      if (!media.path.startsWith("media/")) throw new UserError(`invalid media path: ${media.path}`);
      packageFile(root, media.path);
      if (media.captions) {
        if (!media.captions.startsWith("media/")) throw new UserError(`invalid captions path: ${media.captions}`);
        packageFile(root, media.captions);
      }
    }
    if (d.thread) packageFile(root, d.thread);
    if (!d.post) return { id: d.id, text: `---\n${stringify({ destination: d.id, title: manifest.title })}---\n` };
    const source = packageFile(root, d.post);
    const text = readFileSync(source, "utf8");
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) throw new UserError(`${d.post}: missing YAML frontmatter`);
    let front: unknown;
    try { front = parse(match[1]); } catch (err) { throw new UserError(`${d.post}: invalid frontmatter: ${(err as Error).message}`); }
    if (!front || typeof front !== "object" || Array.isArray(front)) throw new UserError(`${d.post}: invalid frontmatter`);
    const output = `---\n${stringify({ ...front, destination: d.id, media: d.media,
      ...(d.review ? { studio: { reviewHash: d.review.reviewHash, verdict: d.review.verdict } } : {}) })}---\n${match[2]}`;
    parseDraft(d.post, output);
    return { id: d.id, text: output };
  });
  const paths = ["brief.md", ...[...prepared.map((item) => item.id), ...skipped].map((id) => `drafts/${id}.md`),
    ...["sources", "media", "handoff", "review"].flatMap((folder) => packageFiles(root, folder))];
  return writeImport(campaign, config, io, force, config.destinations, skipped, paths, () => {
    writeFileSync(join(campaign, "brief.md"), brief);
    for (const folder of ["sources", "media", "handoff", "review"]) {
      const source = join(root, folder);
      if (existsSync(source)) cpSync(source, join(campaign, folder), { recursive: true });
    }
    for (const item of prepared) {
      const path = draftPath(campaign, item.id);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, item.text);
    }
  }, () => {
    io.out(`Imported: ${imported.map((d) => d.id).join(", ") || "none"}`);
    io.out(`Skipped: ${skipped.join(", ") || "none"}`);
    io.out(`Not enabled: ${unavailable.map((d) => d.id).join(", ") || "none"}`);
    for (const d of unavailable) io.out(`  Add to market-blaster.yml destinations: - ${d.id}`);
    io.out(`Manual: ${manifest.manual.map((m) => m.platform).join(", ") || "none"}`);
  });
}
