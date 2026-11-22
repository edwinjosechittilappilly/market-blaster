# Market Blaster

Ship a feature, then announce it everywhere developers read, with posts grounded in what you actually changed.

`mblast` reads the shipped change: commits, diffs, the PR and your CHANGELOG. From that, an AI agent drafts a post
for each platform. Nothing goes out until you approve the exact text in your terminal.

| Destination | How it publishes |
|---|---|
| DEV, Hashnode (Pro), GitHub Gist | API, with canonical URL and in-place updates |
| Bluesky, Mastodon | API, with link cards and facets on Bluesky and an idempotency key on Mastodon |
| LinkedIn, X | Compose-link handoff by default; API when you opt in (X bills $0.20 per post with a link) |
| HN, Reddit, Threads, Medium, Product Hunt, Substack | Final copy plus a compose link |

```bash
mblast init                                             # once per project
mblast new my-feature --range v1.2.0..HEAD --pr 42      # brief + AI drafts + check
$EDITOR campaigns/my-feature/drafts/*.md                # make them yours
mblast approve my-feature                               # interactive, hash-locked approval
mblast publish my-feature                               # dry run
mblast publish my-feature --yes                         # publish; handoffs print compose links
mblast status my-feature
```

## Install

```bash
gh repo clone edwinjosechittilappilly/market-blaster && cd market-blaster
npm install && npm link && mblast install-skill
```

Requires Node 22.18+. The [guide](docs/guide.md) covers credentials for each platform, the full workflow, recovery
and CI.

## Why this and not X

The [research](docs/research/existing-skills-and-tools.md) compares existing skills, MCP servers and schedulers
(Pipepost, content-distribution-mcp, Crosspost, Typefully, Postiz, Buffer). They start from an article or a blank
prompt. Market Blaster starts from the diff, gives every draft an `evidence:` list pointing into the brief, and flags
numbers and identifiers that don't appear there.

## Safety

- **Approval:** `publish` accepts only content hashes approved in a TTY, so a headless agent cannot publish.
- **Credentials:** they come from the shell or `.env`, and are never passed to the drafting agent or written to state.
- **Preflight:** before the first write, it re-checks lengths with the real URLs and signs in to every API destination.
- **Duplicates:** a timeout becomes `unknown` and blocks reposting until you run `mblast mark`. Articles update in
  place and are not re-created.

## Project layout

- `src/commands/`: one file per CLI command.
- `src/destinations/`: one adapter per platform, behind a single `Destination` interface.
- `skills/market-blaster/SKILL.md`: content rules for the drafting agent.
- `docs/`: research, design, review notes and the guide.
- `openspec/`: specs.

Work is tracked in Beads; run `slipway ui` to see the board.

## Development

```bash
npm test            # node --test, no network
npm run typecheck   # tsc --noEmit
```
