import { createHash, randomUUID } from "node:crypto";
import {
  existsSync, linkSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { UserError } from "./types.ts";
import type { CampaignState, Config, DestinationId, DestinationState, Draft } from "./types.ts";
import { META } from "./destinations/meta.ts";

export function statePath(campaign: string): string {
  return join(campaign, "state.json");
}
export class LockError extends UserError {
  constructor() { super("campaign state is locked by another process"); this.name = "LockError"; }
}

export const needsApproval = (id: DestinationId): boolean => META[id].ai !== "none";

interface LockChecks {
  now: () => number;
  isPidAlive: (pid: number) => boolean;
}

const defaultLockChecks: LockChecks = {
  now: Date.now,
  isPidAlive: (pid) => {
    try { process.kill(pid, 0); return true; }
    catch (err) { return (err as NodeJS.ErrnoException).code !== "ESRCH"; }
  },
};

/** Serialize read-modify-write operations across processes, removing locks from dead processes. */
export async function withStateLock<T>(
  campaign: string,
  fn: () => Promise<T>,
  checks: LockChecks = defaultLockChecks,
): Promise<T> {
  mkdirSync(campaign, { recursive: true });
  const lock = `${statePath(campaign)}.lock`;
  const tmp = `${lock}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmp, String(process.pid), { flag: "wx" });
  try {
    for (;;) {
      try {
        linkSync(tmp, lock);
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
      let stale: boolean;
      try {
        const content = readFileSync(lock, "utf8").trim();
        const pid = /^\d+$/.test(content) ? Number(content) : NaN;
        stale = Number.isSafeInteger(pid) && pid > 0
          ? !checks.isPidAlive(pid)
          : checks.now() - statSync(lock).mtimeMs > 10_000;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
      if (!stale) throw new LockError();
      // Concurrent stale-lock reclaimers can race: one may unlink a replacement lock
      // acquired by the other between the stale check and this unlink.
      try { unlinkSync(lock); }
      catch (err) { if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err; }
    }
  } finally {
    unlinkSync(tmp);
  }
  try {
    return await fn();
  } finally {
    unlinkSync(lock);
  }
}

export function loadState(campaign: string): CampaignState {
  const file = statePath(campaign);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as CampaignState) : {};
}

/** Atomic write: a crash leaves either the old or the new file, never a torn one. */
export function writeFileAtomic(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

export function saveState(campaign: string, state: CampaignState): void {
  writeFileAtomic(statePath(campaign), `${JSON.stringify(state, null, 2)}\n`);
}

/** Merges `patch` into one destination's entry and persists immediately. */
export function updateState(
  campaign: string,
  state: CampaignState,
  dest: DestinationId,
  patch: DestinationState,
): void {
  state[dest] = { ...state[dest], ...patch, at: new Date().toISOString() };
  saveState(campaign, state);
}

/** Approval key: draft content before link resolution, so resolving links never invalidates an approval. */
export function contentHash(draft: Pick<Draft, "destination" | "title" | "canonical" | "body">): string {
  return createHash("sha256")
    .update(JSON.stringify([draft.destination, draft.title ?? "", draft.canonical ?? "", draft.body]))
    .digest("hex");
}

/** Includes all settings that can change the published payload. */
export function approvalHash(draft: Draft, config: Config): string {
  const key = draft.destination === "github-discussion" ? "githubDiscussion" : draft.destination;
  const settings = key in config ? config[key as keyof Config] : undefined;
  return createHash("sha256")
    .update(JSON.stringify([
      draft.destination, draft.title ?? "", draft.canonical ?? "", draft.tags ?? [], draft.body, draft.skip ?? "",
      config.canonicalHome ?? "", settings ?? null,
    ]))
    .digest("hex");
}
