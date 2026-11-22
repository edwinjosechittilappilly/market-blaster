# Destinations

A destination is enabled by listing its ID in `destinations`. API destinations post directly; handoffs give you a compose or submission page for a human to complete. LinkedIn and X default to handoff and use their APIs only when explicitly enabled; if opted in but credentials are missing they fall back to handoff. Browser logins stay in your browser; Market Blaster does not automate posting through it.

AI policy: **draft** means an AI first draft for you to edit and approve; **outline** means talking points and evidence only, with you writing the post; **none** means no generated draft. HN uses the canonical article's title and URL. Outline and none content is not copied by the handoff workflow.

Reach tiers below are the design's judgment, not measured impressions: 1 is the largest relevant developer or founder audience; 3 is mostly existing project followers. “Not assigned” means the design does not assign a tier, not that the destination has no reach. Limits are the checks implemented by Market Blaster, not a guarantee of current platform limits; “no local body limit” does not imply unlimited platform capacity.

| ID | Access | AI | API credentials / setup | Local limits | Reach tier |
|---|---|---|---|---|---|
| `devto` | API; canonical-home option | draft | `DEV_API_KEY` | Title 128 characters; up to four lowercase alphanumeric tags; no local body limit | 1 |
| `hashnode` | API; canonical-home option; off in starter | draft | `HASHNODE_TOKEN`, `hashnode.publicationId`; design notes Pro requirement | Title 250 characters; no local body limit | 2 |
| `gist` | API | draft | `GITHUB_TOKEN` or `gh auth token`, with gist permission | No local body limit | 3 |
| `github-discussion` | GitHub GraphQL API | draft | `GITHUB_TOKEN` or `gh auth token` with Discussions write permission; enabled Discussions, `githubDiscussion.repo` and `githubDiscussion.category` | No local body limit | 3 |
| `bluesky` | API | draft | `BLUESKY_IDENTIFIER`, `BLUESKY_APP_PASSWORD`; optional `BLUESKY_HOST` | 300 graphemes | 2 |
| `mastodon` | API | draft | `MASTODON_TOKEN` and `mastodon.host` or `MASTODON_HOST` | 500 characters by default; configurable or read from instance at preflight; links count 23 | 2 |
| `linkedin` | Handoff by default; API with `linkedin.api: true` | draft | API: `LINKEDIN_ACCESS_TOKEN`; OAuth setup also needs `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` | 3,000 characters | 1 |
| `x` | Intent link by default; paid API with `x.api: true` | draft | API: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | 280 weighted characters; links count 23 | 1 |
| `nostr` | API to configured relays | draft | `NOSTR_PRIVATE_KEY`; optional `nostr.relays` | No local body limit | Not assigned |
| `hn` | Manual link submission | none | No API credentials; account for submission | Title 80 characters | 1 |
| `reddit` | Manual subreddit submission | outline | No API credentials; account and subreddit selection | Title 300 characters; no local body limit | 1 |
| `threads` | Manual intent link | draft | No API credentials; account | 500 characters | 2 |
| `medium` | Manual canonical URL import | draft | No API credentials; account | No local body limit | 2 |
| `producthunt` | Manual launch submission | outline | No API credentials; account and launch assets | No local body limit | 1 |
| `substack` | Manual editor handoff | draft | No API credentials; publication and optional `substack.url` | No local body limit | Not assigned |
| `lemmy` | Manual community handoff | outline | No API credentials; `lemmy.instance` and `lemmy.community` construct its URL | No local body limit | Not assigned |
| `newsletter` | Manual submissions to configured targets | outline | No API credentials; at least one `newsletter.targets` entry | No local body limit | Not assigned |

The approved [auth and reach design](design/auth-and-reach.md) discusses additional platforms such as daily.dev and Lobsters, but they are not destination IDs in this implementation. Discord was deferred. For settings and credential precedence, see [configuration](configuration.md).
