import type { Destination, DestinationId } from "../types.ts";
import { devto } from "./devto.ts";
import { gist } from "./gist.ts";
import { hashnode } from "./hashnode.ts";
import { bluesky } from "./bluesky.ts";
import { mastodon } from "./mastodon.ts";
import { x, linkedin } from "./crosspost.ts";
import { hn, reddit, threads, medium, producthunt, substack } from "./handoffs.ts";

export const ADAPTERS: Record<DestinationId, Destination> = { devto, gist, hashnode, bluesky, mastodon, x, linkedin, hn, reddit, threads, medium, producthunt, substack };
