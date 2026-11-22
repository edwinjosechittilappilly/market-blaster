import type { Destination, DestinationId } from "../types.ts";
import { devto } from "./devto.ts";
import { gist } from "./gist.ts";
import { hashnode } from "./hashnode.ts";
import { githubDiscussion } from "./github-discussion.ts";
import { bluesky } from "./bluesky.ts";
import { mastodon } from "./mastodon.ts";
import { x, linkedin, nostr } from "./crosspost.ts";
import { hn, reddit, threads, medium, producthunt, substack, lemmy, newsletter } from "./handoffs.ts";

export const ADAPTERS: Record<DestinationId, Destination> = { devto, gist, hashnode, "github-discussion": githubDiscussion, bluesky, mastodon, x, linkedin, nostr, hn, reddit, threads, medium, producthunt, substack, lemmy, newsletter };
