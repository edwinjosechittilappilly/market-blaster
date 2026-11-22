import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CampaignState, Config, DestinationId, DestinationState, Draft } from "./types.ts";

export function statePath(campaign: string): string {
  return join(campaign, "state.json");
}

/** Serialize read-modify-write operations across processes, removing locks from dead processes. */
export async function withStateLock<T>(campaign: string, fn: () => Promise<T>): Promise<T> {
  mkdirSync(campaign, { recursive: true });
  const lock = `${statePath(campaign)}.lock`;
  let fd: number;
  try {
    fd = openSync(lock, "wx");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    let stale = false;
    try {
      const pid = Number(readFileSync(lock, "utf8").trim());
      if (Number.isSafeInteger(pid) && pid > 0) {
        try { process.kill(pid, 0); } catch (e) { stale = (e as NodeJS.ErrnoException).code === "ESRCH"; }
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return withStateLock(campaign, fn);
      throw e;
    }
    if (!stale) throw new Error("campaign state is locked by another process");
    try { unlinkSync(lock); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    return withStateLock(campaign, fn);
  }
  try {
    writeFileSync(fd, String(process.pid));
    return await fn();
  } finally {
    closeSync(fd);
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
  const settings = draft.destination in config ? config[draft.destination as keyof Config] : undefined;
  return createHash("sha256")
    .update(JSON.stringify([draft.destination, draft.title ?? "", draft.canonical ?? "", draft.tags ?? [], draft.body, draft.skip ?? "", config.canonicalHome ?? "", settings ?? null]))
    .digest("hex");
}
