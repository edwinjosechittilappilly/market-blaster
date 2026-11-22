// Static facts about each destination, shared by config validation, check, doctor and the publisher.
// Adapters (src/destinations/<id>.ts) implement behaviour; this file only describes.

import type { DestinationId, DestinationKind } from "../types.ts";

export interface DestinationMeta {
  kind: DestinationKind;
  /** Environment variables required for API mode. Empty: handoff only. */
  env: string[];
  /** Frontmatter `title` is required. */
  needsTitle: boolean;
  /** API mode needs `<id>.api: true` in config (paid or approval-gated APIs). */
  optInApi: boolean;
  /** Can fall back to a handoff when API mode is unavailable. */
  hasHandoff: boolean;
  /**
   * What the AI may write (docs/design/auth-and-reach.md):
   * - `draft`: a first draft you edit.
   * - `outline`: talking points only; you write the post, and nothing is copied for you.
   * - `none`: no draft file; the post is built from the canonical article (HN forbids generated text).
   */
  ai: "draft" | "outline" | "none";
}

export const META: Record<DestinationId, DestinationMeta> = {
  devto: { kind: "article", env: ["DEV_API_KEY"], needsTitle: true, optInApi: false, hasHandoff: false, ai: "draft" },
  hashnode: { kind: "article", env: ["HASHNODE_TOKEN"], needsTitle: true, optInApi: false, hasHandoff: false, ai: "draft" },
  gist: { kind: "article", env: ["GITHUB_TOKEN"], needsTitle: true, optInApi: false, hasHandoff: false, ai: "draft" },
  "github-discussion": { kind: "article", env: ["GITHUB_TOKEN"], needsTitle: true, optInApi: false, hasHandoff: false, ai: "draft" },
  bluesky: {
    kind: "social",
    env: ["BLUESKY_IDENTIFIER", "BLUESKY_APP_PASSWORD"],
    needsTitle: false,
    optInApi: false,
    hasHandoff: false,
    ai: "draft",
  },
  mastodon: { kind: "social", env: ["MASTODON_TOKEN"], needsTitle: false, optInApi: false, hasHandoff: false, ai: "draft" },
  linkedin: {
    kind: "social",
    env: ["LINKEDIN_ACCESS_TOKEN"],
    needsTitle: false,
    optInApi: true,
    hasHandoff: true,
    ai: "draft",
  },
  x: {
    kind: "social",
    env: ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"],
    needsTitle: false,
    optInApi: true,
    hasHandoff: true,
    ai: "draft",
  },
  nostr: { kind: "social", env: ["NOSTR_PRIVATE_KEY"], needsTitle: false, optInApi: false, hasHandoff: false, ai: "draft" },
  hn: { kind: "handoff", env: [], needsTitle: false, optInApi: false, hasHandoff: true, ai: "none" },
  reddit: { kind: "handoff", env: [], needsTitle: true, optInApi: false, hasHandoff: true, ai: "outline" },
  threads: { kind: "handoff", env: [], needsTitle: false, optInApi: false, hasHandoff: true, ai: "draft" },
  medium: { kind: "handoff", env: [], needsTitle: false, optInApi: false, hasHandoff: true, ai: "draft" },
  producthunt: { kind: "handoff", env: [], needsTitle: false, optInApi: false, hasHandoff: true, ai: "outline" },
  substack: { kind: "handoff", env: [], needsTitle: true, optInApi: false, hasHandoff: true, ai: "draft" },
  lemmy: { kind: "handoff", env: [], needsTitle: true, optInApi: false, hasHandoff: true, ai: "outline" },
  newsletter: { kind: "handoff", env: [], needsTitle: false, optInApi: false, hasHandoff: true, ai: "outline" },
};

/** Every variable any destination reads; used for `.env.example` and the agent env denylist. */
export const ALL_ENV_VARS = [
  ...new Set([...Object.values(META).flatMap((m) => m.env), "BLUESKY_HOST", "MASTODON_HOST"]),
];

const SOCIAL_ORDER: DestinationId[] = ["bluesky", "mastodon", "linkedin", "x", "nostr"];
const ARTICLE_ORDER: DestinationId[] = ["devto", "hashnode", "gist", "github-discussion"];

/**
 * Publish order: the canonical home (if a destination), the other articles, social, then handoff-only
 * destinations. Only destinations in `enabled` are returned.
 */
export function publishOrder(enabled: DestinationId[], canonicalHome?: string): DestinationId[] {
  const articles = ARTICLE_ORDER.filter((d) => enabled.includes(d));
  const home = articles.find((d) => d === canonicalHome);
  const ordered = [
    ...(home ? [home] : []),
    ...articles.filter((d) => d !== home),
    ...SOCIAL_ORDER.filter((d) => enabled.includes(d)),
    ...enabled.filter((d) => META[d].kind === "handoff"),
  ];
  return ordered;
}
