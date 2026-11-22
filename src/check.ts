import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { META, publishOrder } from "./destinations/meta.ts";
import { loadDrafts } from "./drafts.ts";
import { measureBody, measureTitle } from "./limits.ts";
import { linksIn, resolveLinks } from "./links.ts";
import { reviewHash } from "./manifest.ts";
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
    const mediaItems = draft.media ?? [];
    if (destination === "bluesky") {
      const images = mediaItems.filter((media) => media.kind === "image");
      const videos = mediaItems.filter((media) => media.kind === "video");
      if (mediaItems.filter((media) => media.kind === "vtt" || media.kind === "caption").length > 20)
        add("error", "Bluesky allows at most 20 captions");
      if (images.length > 4) add("error", "Bluesky allows at most 4 images");
      if (videos.length > 1 || (videos.length && images.length)) add("error", "Bluesky allows one video or up to 4 images, not both");
      if (mediaItems.some((media) => !["image", "video", "vtt", "caption"].includes(media.kind)))
        add("error", "Bluesky supports images, video and VTT captions only");
      if (!videos.length && mediaItems.some((media) => media.kind === "vtt" || media.kind === "caption"))
        add("error", "Bluesky captions require a video");
    }
    if (destination === "mastodon" && mediaItems.length) {
      add("warning", "Mastodon media limits use configured defaults; instance limits are verified at publish preflight");
      if (mediaItems.length > (config.mastodon.maxMediaAttachments ?? 4)) add("error", "Mastodon media exceeds configured attachment count");
      if (mediaItems.some((media) => !["image", "video"].includes(media.kind)))
        add("error", "Mastodon supports image and video attachments only");
    }
    if (destination === "linkedin" && config.linkedin.api && !mediaItems.some((media) => media.kind === "pdf" || /\.pdf$/i.test(media.path))) {
      if (mediaItems.length > 20) add("error", "LinkedIn allows at most 20 images");
      if (mediaItems.some((media) => media.kind !== "image")) add("error", "LinkedIn API supports image attachments only");
    }
    if (destination === "devto" && mediaItems.some((media) => media.cover) && !config.devto.coverUrl)
      add("warning", "DEV cover requires devto.coverUrl; attach or host the image manually");
    for (const media of mediaItems.flatMap((item) => item.captions
      ? [item, { path: item.captions, alt: item.alt, kind: "vtt" }] : [item])) {
      if (!media.alt.trim()) add("error", `media ${media.path}: missing alt text`);
      try {
        const base = realpathSync(campaign);
        if (isAbsolute(media.path)) throw new Error();
        const file = realpathSync(resolve(base, media.path));
        const rel = relative(base, file);
        if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !statSync(file).isFile()) throw new Error();
        const size = statSync(file).size;
        const limit = destination === "bluesky" ? media.kind === "image" ? 2_000_000 : media.kind === "video" ? 300_000_000 : 20_000
          : destination === "mastodon" ? media.kind === "image" ? config.mastodon.imageSizeLimit ?? 16_777_216
            : media.kind === "video" ? config.mastodon.videoSizeLimit ?? 103_809_024 : undefined
          : undefined;
        if (limit !== undefined && size > limit) add("error", `media ${media.path}: ${size} bytes exceeds limit ${limit}`);
        if (destination === "gist") {
          const bytes = readFileSync(file);
          if (!/\.(?:svg|txt|md|markdown|json|ya?ml|csv|xml|html|css|js|ts|log)$/i.test(file)
            || bytes.includes(0) || !Buffer.from(bytes.toString("utf8")).equals(bytes))
            add("error", `media ${media.path}: Gist accepts SVG and UTF-8 text only`);
        }
      } catch { add("error", `media ${media.path}: missing or not campaign-local`); }
    }
    if (draft.studio && reviewHash({ title: draft.title, body: draft.body, media: draft.media ?? [] }) !== draft.studio.reviewHash)
      add("warning", "Studio review is stale");
    if (destination === "devto") {
      const tags = draft.tags ?? config.devto.tags ?? [];
      if (tags.length > 4 || tags.some((tag) => !/^[a-z0-9]+$/.test(tag)))
        add("error", "DEV tags must be lowercase letters/digits, max 4");
    }
    if (META[destination].needsTitle && !draft.title?.trim()) add("error", "missing required title");
    if (!draft.evidence.length || draft.evidence.some((e) => !e.trim())) add("error", "missing required evidence");
    for (const anchor of draft.evidence) if (!anchors.has(anchor)) add("error", `unknown evidence anchor ${anchor}`);
    const text = [draft.title ?? "", META[destination].ai === "outline" ? "" : draft.body, draft.canonical ?? ""]
      .join("\n");
    for (const link of new Set(linksIn(text))) {
      const index = order.indexOf(link as DestinationId);
      if (index < 0) add("error", `link to ${link}: destination is not enabled`);
      else if (index >= order.indexOf(destination))
        add("error", `link to ${link}: destination is not earlier in publish order`);
    }
    const body = META[destination].ai === "outline"
      ? null : measureBody(destination, resolveLinks(draft.body, {}, { worstCase: true }), config);
    const title = META[destination].ai !== "outline" && draft.title
      ? measureTitle(destination, resolveLinks(draft.title, {}, { worstCase: true })) : null;
    for (const measure of [body, title]) if (measure && measure.length > measure.max) {
      const uncertainMastodon = destination === "mastodon" && measure === body
        && config.mastodon.maxChars == null && measure.length < 11000;
      add(uncertainMastodon ? "warning" : "error", uncertainMastodon
        ? `${measure.length} ${measure.unit} exceeds default 500; instance limit is verified at publish preflight`
        : `${measure.length} ${measure.unit} exceeds limit ${measure.max}`);
    }
    const groundingText = [draft.title ?? "", draft.body, draft.canonical ?? ""].join("\n")
      .replace(/https?:\/\/[^\s<>)\]]+|\{\{url:[^}]*\}\}/g, "").replace(/^[ \t]*\d[.)][ \t]+/gm, "");
    const tokens = groundingText.match(
      /`[^`\n]+`|(?<![\w.])v?\d+(?:,\d{3})*(?:\.\d+)*(?:[-+][\w.-]+)?(?:%|[a-zA-Zµ]+)?/g,
    ) ?? [];
    for (const token of new Set(tokens)) {
      const value = token.startsWith("`") ? token.slice(1, -1) : token;
      if (!brief.includes(value)) add("warning", `${token} not found in brief`);
    }
  }
  return { drafts, findings };
}
