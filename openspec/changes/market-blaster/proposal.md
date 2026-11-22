# Proposal

## Why

Every feature I ship should reach the places developers read: DEV, Hashnode, Gist, LinkedIn, X, Bluesky, Mastodon, HN
and Reddit. Writing nine platform-specific posts by hand means it rarely happens. Existing tools start from a finished
article or from variants an agent already wrote. None starts from the shipped change, and none keeps claims tied to
evidence (see `docs/research/existing-skills-and-tools.md`).

## What Changes

- New `mblast` CLI (Node, TypeScript). Commands: `init`, `doctor`, `new`, `brief`, `draft`, `check`, `approve`,
  `publish`, `mark`, `status`, `install-skill`.
- One campaign folder per feature, containing `brief.md`, `drafts/<destination>.md` and `state.json`.
- An evidence brief with anchored sections, built from:
  - git history;
  - diff stat and bounded diff hunks;
  - an optional GitHub PR;
  - the matching CHANGELOG section.
- AI drafting through a `market-blaster` agent skill. It runs headless with no access to credentials. A grounding
  check flags claims that are not in the brief.
- A human approval gate. Content hashes are approved in a TTY, and only approved content is published.
- Publishing:
  - DEV, Hashnode, Gist, Bluesky and Mastodon through our own adapters.
  - X and LinkedIn through Crosspost, opt-in.
  - Compose-link handoffs for HN, Reddit, Threads, Medium, Product Hunt and Substack, and for X and LinkedIn by
    default.
- Safety:
  - Dry run by default.
  - Preflight before the first write.
  - A canonical home for articles.
  - Updates instead of duplicates.
  - `unknown` status after timeouts, resolved by `mblast mark`.

## Capabilities

### New Capabilities

- `campaign-brief`: collects anchored evidence about a shipped change into a reviewable brief.
- `content-drafts`: generates, grounds and validates per-destination drafts from a brief and the brand config.
- `publishing`: handles approval, preflight, ordered publishing and handoffs, updates, and duplicate-safe state.
- `project-setup`: covers project config, credential discovery, the doctor report and skill installation.

### Modified Capabilities

None (new project).

## Impact

- New repository `market-blaster`:
  - `src/`
  - `bin/mblast.mjs`
  - `skills/market-blaster/SKILL.md`
  - `docs/guide.md`
- Dependencies: `@humanwhocodes/crosspost` (Apache-2.0) and `yaml`. Runtime: Node 22.18+.
- External APIs: Forem, GitHub Gists, Hashnode GraphQL, AT Protocol, Mastodon, LinkedIn Posts, X v2.
- Costs, only when opted in: X at $0.20 per post with a link, Hashnode Pro.
