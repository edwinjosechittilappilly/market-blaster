import { DESTINATION_IDS, type DestinationId } from "./types.ts";

/** `{{url:devto}}`: replaced at publish time with the URL recorded for that destination. */
export const LINK_RE = /\{\{\s*url:([a-z]+)\s*\}\}/g;

/** Length every unresolved link counts as when checking limits (worst case for a long article slug). */
export const LINK_WORST_CASE = 100;

export function linksIn(text: string): string[] {
  return [...text.matchAll(LINK_RE)].map((m) => m[1]);
}

export function isDestinationId(value: string): value is DestinationId {
  return (DESTINATION_IDS as readonly string[]).includes(value);
}

/**
 * Replaces each link with `urls[id]`; unknown ids are left as written so the caller can report them.
 * With `worstCase`, unresolved links become a placeholder of LINK_WORST_CASE characters.
 */
export function resolveLinks(
  text: string,
  urls: Partial<Record<string, string>>,
  opts: { worstCase?: boolean } = {},
): string {
  return text.replace(LINK_RE, (whole, id: string) => {
    const url = urls[id];
    if (url) return url;
    if (opts.worstCase) return `https://${"x".repeat(LINK_WORST_CASE - 8)}`;
    return whole;
  });
}
