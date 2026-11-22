import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CampaignState, DestinationId, DestinationState, Draft } from "./types.ts";

export function statePath(campaign: string): string {
  return join(campaign, "state.json");
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
