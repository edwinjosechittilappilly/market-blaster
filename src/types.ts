// Shared contracts. Every module imports types from here; destinations implement `Destination`.

export const DESTINATION_IDS = [
  "devto",
  "hashnode",
  "gist",
  "github-discussion",
  "bluesky",
  "mastodon",
  "linkedin",
  "x",
  "nostr",
  "hn",
  "reddit",
  "threads",
  "medium",
  "producthunt",
  "substack",
  "lemmy",
  "newsletter",
] as const;

export type DestinationId = (typeof DESTINATION_IDS)[number];
export type NewsletterTarget = "console-dev" | "javascript-weekly" | "golang-weekly" | "changelog-news";
export type DestinationKind = "article" | "social" | "handoff";

export interface BrandConfig {
  name: string;
  pitch?: string;
  audience?: string;
  voice?: string[];
  links?: Record<string, string>;
  hashtags?: string[];
}

export interface Config {
  /** Directory holding market-blaster.yml; all relative paths resolve from here. */
  root: string;
  brand: BrandConfig;
  destinations: DestinationId[];
  /** A long-form destination id or an absolute URL. */
  canonicalHome?: string;
  campaignsDir: string;
  /** `timeoutSeconds`: how long `mblast draft` lets the agent run before killing it (default 900). */
  agent: { command: string[]; timeoutSeconds: number };
  devto: { tags?: string[]; publish?: boolean; coverUrl?: string };
  hashnode: { publicationId?: string };
  githubDiscussion: { repo?: string; category?: string };
  nostr: { relays: string[] };
  lemmy: { instance?: string; community?: string };
  newsletter: { targets: NewsletterTarget[] };
  gist: { public?: boolean };
  bluesky: { host?: string; langs?: string[] };
  /** `maxChars`: the instance's status limit; the adapter reads it from the instance at preflight. */
  mastodon: { host?: string; maxChars?: number; maxMediaAttachments?: number; imageSizeLimit?: number; videoSizeLimit?: number };
  linkedin: { api?: boolean };
  x: { api?: boolean };
  reddit: { subreddit?: string };
  substack: { url?: string };
  /** `title`: HN submission title when `canonicalHome` is a URL (no draft title to reuse). */
  hn: { title?: string };
}

export interface Draft {
  destination: DestinationId;
  title?: string;
  tags?: string[];
  canonical?: string;
  evidence: string[];
  body: string;
  /** Set when the agent or author decided this destination should not get a post; the value is the reason. */
  skip?: string;
  /** Path of the draft file. */
  media?: { path: string; alt: string; kind: string; cover?: boolean; lang?: string; captions?: string }[];
  studio?: { reviewHash: string; verdict: string };
  path: string;
}

/** A draft after `{{url:<id>}}` links are replaced with real URLs. */
export interface ResolvedPost {
  destination: DestinationId;
  title?: string;
  tags?: string[];
  canonical?: string;
  body: string;
  /** Attachments have absolute, campaign-local paths after resolution. */
  media?: Draft["media"];
  /** Hash of the draft before link resolution; the approval key. */
  contentHash: string;
}

export type Status = "pending" | "published" | "staged" | "handoff" | "failed" | "unknown" | "blocked";

export interface DestinationState {
  approvedHash?: string;
  status?: Status;
  id?: string;
  url?: string;
  contentHash?: string;
  at?: string;
  error?: string;
  /** Outcome of the latest update attempt on an already-published entry; the entry itself stays `published`. */
  lastAttempt?: { status: "unknown" | "failed"; error: string };
  /** Title as published, recorded for the canonical home so HN submits the title readers actually see. */
  title?: string;
}

export type CampaignState = Partial<Record<DestinationId, DestinationState>>;

export type Env = Record<string, string | undefined>;

export interface Ctx {
  fetch: typeof fetch;
  env: Env;
  config: Config;
  timeoutMs: number;
  /** Runs a command and returns stdout; used for `gh auth token`. Injected for tests. */
  run?: (cmd: string, args: string[]) => Promise<string>;
  crosspost?: (id: "x" | "linkedin" | "nostr", env: Env) => {
    post(text: string, options: { signal: AbortSignal; images?: { data: Uint8Array; alt: string }[] }): Promise<unknown>;
    getUrlFromResponse?(response: never): string;
  };
}

export interface Published {
  id: string;
  url: string;
  staged?: boolean;
}

export interface HandoffInfo {
  url?: string;
  /** What the compose URL prefills: the whole post, only the link, or nothing. */
  prefills: "full" | "link" | "none";
}

export interface Destination {
  id: DestinationId;
  kind: DestinationKind;
  /** Environment variables that must all be set for API mode. Empty for handoff-only destinations. */
  env: string[];
  /** Platform-specific length; `null` when the platform has no practical limit. */
  limit(text: string, ctx: Ctx): { length: number; max: number } | null;
  /** True when API mode is enabled by config (e.g. `x.api: true`); defaults to true when absent. */
  apiEnabled?(config: Config): boolean;
  /** One authenticated read; throws on bad credentials. */
  verify?(ctx: Ctx): Promise<void>;
  /** Read-only destination-specific validation, before any upload or post. */
  preflight?(post: ResolvedPost, ctx: Ctx): Promise<void>;
  create?(post: ResolvedPost, ctx: Ctx, opts: { stage: boolean }): Promise<Published>;
  update?(id: string, post: ResolvedPost, ctx: Ctx, opts: { stage: boolean }): Promise<Published>;
  handoff?(post: ResolvedPost, ctx: Ctx): HandoffInfo;
  /** Request body the dry run prints. */
  payload(post: ResolvedPost, ctx: Ctx, opts?: { stage: boolean }): unknown;
  /** Expected charge in USD for one create, when the platform bills per call. */
  cost?(post: ResolvedPost): number;
}

/** An upload cannot have created the final post, even if its outcome is unknown. */
export class MediaUploadError extends Error {
  constructor(cause: unknown) {
    super(`media upload failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
}

/** Thrown by adapters for a non-2xx response. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Thrown by `mblast` for user-facing errors; the CLI prints the message and exits 1. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}
