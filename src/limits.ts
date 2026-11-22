import type { Config, DestinationId } from "./types.ts";

const URL_RE = /https?:\/\/[^\s)>\]]+/g;
/** X and Mastodon count every link as 23 characters (t.co length). */
const SHORT_LINK = "x".repeat(23);

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

export function graphemes(text: string): number {
  let n = 0;
  for (const _ of segmenter.segment(text)) n++;
  return n;
}

/**
 * X weighted length (twitter-text v3): code points in these ranges weigh 1, everything else 2;
 * links weigh 23; emoji count as one grapheme of weight 2.
 */
export function xLength(text: string): number {
  const light = (cp: number) =>
    (cp >= 0 && cp <= 4351) || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247);
  let length = 0;
  for (const { segment } of segmenter.segment(text.replace(URL_RE, SHORT_LINK))) {
    const cps = [...segment].map((c) => c.codePointAt(0) ?? 0);
    const emoji = /\p{Extended_Pictographic}/u.test(segment);
    length += emoji ? 2 : cps.reduce((sum, cp) => sum + (light(cp) ? 1 : 2), 0);
  }
  return length;
}

export interface Measure {
  length: number;
  max: number;
  /** What is measured, for messages: "body graphemes", "title characters". */
  unit: string;
}

/** Body length check per destination; `null` when the platform has no practical limit on the body. */
export function measureBody(dest: DestinationId, text: string, config: Config): Measure | null {
  switch (dest) {
    case "bluesky":
      return { length: graphemes(text), max: 300, unit: "graphemes" };
    case "mastodon":
      return {
        length: [...text.replace(URL_RE, SHORT_LINK)].length,
        max: config.mastodon.maxChars ?? 500,
        unit: "characters (links count 23)",
      };
    case "x":
      return { length: xLength(text), max: 280, unit: "weighted characters" };
    case "linkedin":
      return { length: [...text].length, max: 3000, unit: "characters" };
    case "threads":
      return { length: [...text].length, max: 500, unit: "characters" };
    default:
      return null;
  }
}

/** Title length check where the platform enforces one. */
export function measureTitle(dest: DestinationId, title: string): Measure | null {
  const max: Partial<Record<DestinationId, number>> = { hn: 80, reddit: 300, devto: 128, hashnode: 250 };
  const limit = max[dest];
  return limit ? { length: [...title].length, max: limit, unit: "title characters" } : null;
}
