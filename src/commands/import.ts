import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { stringify } from "yaml";
import { checkCampaign } from "../check.ts";
import { campaignDir, loadConfig } from "../config.ts";
import { draftPath } from "../drafts.ts";
import type { Command } from "../io.ts";
import { loadManifest, packageFile } from "../manifest.ts";
import { loadState, saveState, withStateLock } from "../state.ts";
import { UserError } from "../types.ts";

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    slug: { type: "string" }, force: { type: "boolean" },
  } });
  if (positionals.length !== 1) throw new UserError("usage: mblast import <dir> [--slug s] [--force]");
  const root = resolve(io.cwd, positionals[0]);
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
  return withStateLock(campaign, async () => {
    const state = loadState(campaign);
    const destinations = new Set([...config.destinations, ...manifest.posts.map((post) => post.destination)]);
    const approved = [...destinations].filter((id) => state[id]?.approvedHash);
    if (approved.length && !values.force) throw new UserError(`approved drafts would be overwritten: ${approved.join(", ")}; use --force`);
    if (approved.length) {
      for (const id of approved) delete state[id]!.approvedHash;
      saveState(campaign, state);
    }
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
    for (const destination of config.destinations) {
      if (manifest.posts.some((post) => post.destination === destination)) continue;
      const path = draftPath(campaign, destination);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `---\n${stringify({ destination, skip: "not planned in studio" })}---\n`);
    }
    const { findings } = checkCampaign(config, campaign);
    for (const f of findings) io.out(`${f.destination}  ${f.level}  ${f.message}`);
    const errors = findings.filter((f) => f.level === "error").length;
    io.out(`${errors} error(s), ${findings.length - errors} warning(s)`);
    return errors ? 1 : 0;
  });
};
