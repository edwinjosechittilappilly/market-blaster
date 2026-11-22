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
}

export const META: Record<DestinationId, DestinationMeta> = {
  devto: { kind: "article", env: ["DEV_API_KEY"], needsTitle: true, optInApi: false, hasHandoff: false },
  hashnode: { kind: "article", env: ["HASHNODE_TOKEN"], needsTitle: true, optInApi: false, hasHandoff: false },
  gist: { kind: "article", env: ["GITHUB_TOKEN"], needsTitle: true, optInApi: false, hasHandoff: false },
  bluesky: {
    kind: "social",
    env: ["BLUESKY_IDENTIFIER", "BLUESKY_APP_PASSWORD"],
    needsTitle: false,
    optInApi: false,
    hasHandoff: false,
  },
  mastodon: { kind: "social", env: ["MASTODON_TOKEN"], needsTitle: false, optInApi: false, hasHandoff: false },
  linkedin: { kind: "social", env: ["LINKEDIN_ACCESS_TOKEN"], needsTitle: false, optInApi: true, hasHandoff: true },
  x: {
    kind: "social",
    env: ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"],
    needsTitle: false,
    optInApi: true,
    hasHandoff: true,
  },
  hn: { kind: "handoff", env: [], needsTitle: true, optInApi: false, hasHandoff: true },
  reddit: { kind: "handoff", env: [], needsTitle: true, optInApi: false, hasHandoff: true },
  threads: { kind: "handoff", env: [], needsTitle: false, optInApi: false, hasHandoff: true },
  medium: { kind: "handoff", env: [], needsTitle: false, optInApi: false, hasHandoff: true },
  producthunt: { kind: "handoff", env: [], needsTitle: false, optInApi: false, hasHandoff: true },
  substack: { kind: "handoff", env: [], needsTitle: true, optInApi: false, hasHandoff: true },
};

/** Every variable any destination reads; used for `.env.example` and the agent env denylist. */
export const ALL_ENV_VARS = [
  ...new Set([...Object.values(META).flatMap((m) => m.env), "BLUESKY_HOST", "MASTODON_HOST"]),
];

const SOCIAL_ORDER: DestinationId[] = ["bluesky", "mastodon", "linkedin", "x"];
const ARTICLE_ORDER: DestinationId[] = ["devto", "hashnode", "gist"];

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
