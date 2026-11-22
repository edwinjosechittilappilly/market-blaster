# Tasks

Tracked in Beads: epic market-blaster-88g (implementation beads .10–.15). Close the beads rather than ticking these
checkboxes; tick the checkboxes when the epic closes.

## 1. Project setup (init, config, env, doctor, skill install)

- [ ] 1.1 Scaffold `package.json` (`"type": "module"`, `bin: mblast`), `bin/mblast.mjs` and `src/cli.ts`, with deps `@humanwhocodes/crosspost` and `yaml`. Verify: `node bin/mblast.mjs --help` prints the command list.
- [ ] 1.2 Write the config loader. It validates `brand.name`, destination ids and `canonicalHome`, and applies defaults (`campaignsDir`, `agent.command`). Verify: tests cover an unknown destination, a missing brand, and a bad `canonicalHome`.
- [ ] 1.3 Write the `.env` loader (shell values win) and `mblast init`. Verify: tests cover the precedence rule, and that init keeps an existing config and adds `.env` to `.gitignore`.
- [ ] 1.4 Write `mblast doctor`. It reports api/handoff/missing per destination; `--online` calls `verify()`. Verify: with a partial env, a test shows `devto api` and `x handoff`.
- [ ] 1.5 Write `mblast install-skill`. It symlinks into `~/.agents/skills` and `~/.claude/skills` and never replaces a real directory. Verify: a test against a temporary HOME.

## 2. Campaign brief

- [ ] 2.1 Write `mblast brief <slug> --range`. It outputs the remote URL, commits and diff stat under `[E#]` anchors, plus bounded hunks for README/docs/examples/tests/entry files (400-line cap). Verify: tests against a temporary git repo, including truncation.
- [ ] 2.2 Add `--pr` through `gh pr view --json`, a `--version` CHANGELOG section, warnings when either fails, the `--force` guard, and the author-notes section. Verify: tests with a stubbed runner.

## 3. Drafts, grounding and check

- [ ] 3.1 Write the draft parser (frontmatter and body) and per-destination limits. Bluesky counts graphemes, X counts weighted characters, and links count as 100 characters. Verify: tests for Bluesky over 300 and for X weighting.
- [ ] 3.2 Write `mblast check`. It checks required fields, evidence anchors and link order, and emits grounding warnings; `--strict` turns warnings into errors. Verify: tests for a `{{url:bluesky}}` link in devto, an unknown anchor, and "3x" missing from the brief.
- [ ] 3.3 Write `skills/market-blaster/SKILL.md`, with the grounding rules, the evidence list, the runnable-example rule, and a section per destination. Verify: a test asserts that every destination id has a section.
- [ ] 3.4 Write `mblast draft` and `mblast new`. They fence the brief as untrusted, run the agent with the allowlisted environment, and keep existing drafts unless `--force`. Verify: with a fake agent script, a test shows it writes drafts and does not see `DEV_API_KEY`.

## 4. Publishing tracer: approval, DEV, Gist, state, handoffs

- [ ] 4.1 Write the `Destination` interface, the order (canonical home first), link resolution from state, and a dry run that prints payloads and X cost. Verify: a dry-run test makes zero write calls.
- [ ] 4.2 Write `mblast approve`. It requires a TTY and records hashes; publish refuses anything unapproved or edited after approval. Verify: tests for no TTY and for an edit after approval.
- [ ] 4.3 Write the DEV adapter (create, update, `canonical_url`, tags, published, stage) and the Gist adapter (token from env or `gh auth token`). Verify: mocked-fetch tests assert request bodies, the `PUT` on update, and staging.
- [ ] 4.4 Write the state machine: pending, then published, failed or unknown, written atomically. Retries happen only on 429 or a refused connection. Add preflight (checks, links, lengths, `verify`), `blocked` links, and `mblast mark`. Verify: tests for a rerun after partial failure, a timeout leading to `unknown`, refusal, and resolution through `mark`.
- [ ] 4.5 Write handoffs (HN, Reddit, X, LinkedIn, Threads, Medium, Product Hunt, Substack), with `--open` and the clipboard. Verify: a test checks the HN submitlink encoding and that X falls back to a handoff without `api: true`.
- [ ] 4.6 Write `mblast status`. Verify: an output test.

## 5. Remaining API destinations

- [ ] 5.1 Write the Hashnode adapter (`publishPost` with `originalArticleURL`, `updatePost`, draft staging). Verify: mocked GraphQL tests.
- [ ] 5.2 Write the Bluesky adapter (createSession, createRecord with link facets at UTF-8 byte offsets, and an external card) and the Mastodon adapter (instance limit, `Idempotency-Key`). Verify: tests check the facet offsets for a non-ASCII post and the idempotency header.
- [ ] 5.3 Wire X and LinkedIn through Crosspost strategies when `api: true` and credentials are present. Verify: a test with an injected fake strategy receives the resolved text.

## 6. Docs and end-to-end check

- [ ] 6.1 Write `docs/guide.md` (install, credentials per platform, the brief → draft → check → approve → publish flow, recovery, CI) and the README. Verify: every command in the guide runs.
- [ ] 6.2 Dogfood: run brief, draft, check and a dry-run publish for a campaign announcing market-blaster itself. Verify: `mblast check` exits 0 and the dry run prints every destination.

## Workflow follow-up

- Run a cross-vendor review of the implementation and fix the findings.
- Archive the change after review (`openspec archive market-blaster`).
