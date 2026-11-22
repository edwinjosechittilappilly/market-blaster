# Market Blaster

Ship a feature, then announce it everywhere developers read, with posts grounded in what you actually changed.

`mblast` reads the shipped change: commits, diffs, the PR and the CHANGELOG. An AI agent drafts a post for each
platform from that evidence. You approve the exact text in your terminal before anything is published. Platforms
with no usable API get a compose link in your own browser, and you click Post yourself. Market Blaster never
automates a website.

| Destination | How it publishes |
|---|---|
| DEV, GitHub Gist, GitHub Discussions | API. Canonical URL and in-place updates |
| Bluesky, Mastodon, Nostr | API. Link facets and cards on Bluesky; idempotency key on Mastodon |
| LinkedIn | API through `mblast auth linkedin` (OAuth; renew about every 60 days), or a share link |
| X, Threads | Intent link with the text prefilled (X API optional, billed per post) |
| Hashnode | API, needs Hashnode Pro (off by default) |
| Hacker News | Link and original title only. HN forbids generated text and automated posting, so you write any text yourself |
| Reddit, Product Hunt, Lemmy, dev newsletters | Compose or submit link with AI talking points. You write the post |
| Medium, Substack | Import or editor link with the draft copied |
| DevHunt, AlternativeTo, Uneed, Indie Hackers | One-time project listings tracked by `mblast launch` |

```bash
mblast init                                          # once per project
mblast auth set DEV_API_KEY                          # credentials go to the macOS Keychain
mblast doctor --online                               # what publishes by API, what hands off
mblast new my-feature --range v1.2.0..HEAD --pr 42   # evidence brief + AI drafts + check
$EDITOR campaigns/my-feature/drafts/*.md             # make them yours
mblast approve my-feature                            # interactive, hash-locked approval
mblast publish my-feature                            # dry run: payloads, modes, cost
mblast publish my-feature --yes                      # API destinations
mblast publish my-feature --assist                   # walk through handoffs; records permalinks
mblast status my-feature
```

## Install

```bash
gh repo clone edwinjosechittilappilly/market-blaster && cd market-blaster
npm install && npm link && mblast install-skill
```

Requires Node 22.18+. The [guide](docs/guide.md) covers each platform's credentials, the full workflow, recovery,
launch directories and CI.

## Why it exists

The research compares existing skills, MCP servers and schedulers (Pipepost, content-distribution-mcp, Crosspost,
Typefully, Postiz, Buffer): see [existing tools](docs/research/existing-skills-and-tools.md),
[auth and access](docs/research/auth-and-access.md) and [free destinations](docs/research/free-destinations.md). They
start from an article or a blank prompt. Market Blaster starts from the diff. Every draft cites `evidence:` anchors
in the brief, and `check` flags numbers and identifiers that the brief doesn't contain.

## Safety

- **Approval:** `publish` only posts content hashes that were approved in a terminal. The drafting agent runs in a
  temporary workspace and sees no credentials and no project files.
- **No browser automation:** LinkedIn, X, Threads and HN terms forbid scripting their sites
  ([research](docs/research/browser-relay.md)). Handoffs open official compose URLs in your normal browser, so your
  logins never leave it.
- **No duplicates:**
  - A timeout or a gateway error becomes `unknown` and blocks reposting until `mblast mark`.
  - Articles update in place.
  - A lock stops two publish runs from overlapping.
- **AI policy per destination:** HN gets no generated text. Reddit, Product Hunt, Lemmy and newsletters get talking
  points only.

## Project layout

| Path | Contents |
|---|---|
| `src/commands/` | One file per CLI command |
| `src/destinations/` | One adapter per platform behind a single `Destination` interface |
| `skills/market-blaster/` | Drafting rules and per-destination reach guidance for the agent |
| `docs/` | Research, design, the auth and reach plan, review notes, and the guide |
| `openspec/` | Specs |

Work is tracked in Beads. Run `slipway ui` to see the board.

## Development

```bash
npm test            # node --test, no network
npm run typecheck   # tsc --noEmit
```
