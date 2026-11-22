import { HttpError } from "../types.ts";
import type { Ctx, DestinationId } from "../types.ts";
import { META } from "./meta.ts";

export function redactAdapter(text: string, ctx: Ctx, id: DestinationId): string {
  const keys = [...META[id].env, ...(id === "bluesky" ? ["BLUESKY_HOST"] : id === "mastodon" ? ["MASTODON_HOST"] : [])];
  return keys.reduce((value, key) => ctx.env[key] ? value.split(ctx.env[key]!).join("***") : value, text);
}

export async function requestJson<T>(ctx: Ctx, id: DestinationId, url: string, init: RequestInit = {}): Promise<T> {
  const response = await ctx.fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(ctx.timeoutMs) });
  if (!response.ok || response.type === "opaqueredirect") {
    const text = redactAdapter((await response.text()).slice(0, 200), ctx, id);
    const hint = id === "hashnode"
      && (response.type === "opaqueredirect" || response.status >= 300 && response.status < 400)
      ? " (Hashnode GraphQL API moved to a paid offering)" : "";
    const error = new HttpError(response.status, `${id} ${response.status}: ${text}${hint}`);
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) Object.assign(error, { retryAfter });
    throw error;
  }
  try {
    if (!/\b(?:application\/json|[^;\s]+\+json)\b/i.test(response.headers.get("content-type") ?? "")) {
      throw new Error("response is not JSON");
    }
    return await response.json() as T;
  } catch (cause) {
    const error = new Error(`${id}: could not parse successful response`, { cause });
    error.name = "UncertainResponseError";
    throw error;
  }
}
