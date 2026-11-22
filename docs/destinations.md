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

## Media attachments

Add campaign-local files to a draft's frontmatter. Alt text is required:

```yaml
media:
  - path: media/diagram.png
    kind: image
    alt: Diagram showing the data flow from source to destination
```

`mblast check` validates paths, alt text and destination limits. Approval displays each path and description; enter `p` at the approval prompt to open previews. Changing file bytes invalidates approval. All media preflight checks run before any upload or post.

| Destination | Media delivery |
|---|---|
| Bluesky | Up to four images, 2,000,000 bytes each, replace any link card; one MP4 video up to 300,000,000 bytes may instead have VTT captions (`captions: media/captions.vtt` on the video, or a separate `kind: vtt` attachment; optional `lang`). Video delivery needs `ffprobe`. |
| Mastodon | Images or video are uploaded with descriptions. Check uses defaults of four attachments, 16,777,216 image bytes and 103,809,024 video bytes; `mastodon.maxMediaAttachments`, `imageSizeLimit` and `videoSizeLimit` override them. Instance limits are checked at preflight. |
| LinkedIn | API mode sends images with alt text. A PDF carousel is a manual handoff, even in API mode. |
| DEV | A cover marked `cover: true` uses the hosted `devto.coverUrl`; local media is not uploaded. Host inline images yourself. |
| Gist | SVG and UTF-8 text attachments only; binary files are rejected. |
| Manual destinations | The handoff lists files for the human to attach. |

The approved [auth and reach design](design/auth-and-reach.md) discusses additional platforms such as daily.dev and Lobsters, but they are not destination IDs in this implementation. Discord was deferred. For settings and credential precedence, see [configuration](configuration.md).
