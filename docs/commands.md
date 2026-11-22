# Command reference

Run `mblast help`, `mblast --help`, or `mblast -h` for the command list. Commands that need a project find `market-blaster.yml` by walking upward from the current directory. Campaign slugs contain lowercase letters, digits and dashes and start with a letter or digit.

## Setup and credentials

- `mblast init` writes a starter `market-blaster.yml` and `.env.example` in the current directory if absent, and adds `.env` to `.gitignore` if needed. Existing configuration and example files are retained.
- `mblast install-skill` links the bundled skill into `~/.agents/skills/market-blaster` and `~/.claude/skills/market-blaster`. Existing real files or directories are not replaced.
- `mblast auth set <KEY> [--stdin]` saves a known credential in macOS Keychain. Without `--stdin`, enter it in the hidden terminal prompt; with it, pipe the value on standard input. `mblast auth list` shows sources, not values. `mblast auth linkedin` opens the LinkedIn OAuth flow; first set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` and register `http://localhost:8723/callback` in the app. The token and issue date are saved in Keychain. Shell and `.env` values override Keychain.
- `mblast doctor [--online]` reports enabled destinations' API, handoff, or missing status and credential sources. `--online` verifies API credentials where an adapter supports it. LinkedIn tokens older than 50 days trigger a renewal warning.

## Campaigns

- `mblast new <slug> --range A..B [--pr N] [--version V]` runs brief, draft, and check in sequence. Options are passed to brief; it does not overwrite an existing brief.
- `mblast brief <slug> --range A..B [--pr N] [--version V] [--force]` writes `brief.md` with git commits, changed files and selected diffs as evidence. `--pr` adds a GitHub PR via `gh`; `--version` adds the matching `CHANGELOG.md` section. These optional sources warn if unavailable. `--force` overwrites the existing brief.
- `mblast draft <slug> [--force]` uses the configured agent and the brief to create destination drafts. Existing drafts are retained unless `--force` is supplied; destinations with AI policy `none` have no draft.
- `mblast check <slug> [--strict] [--only a,b]` validates drafts. `--only` restricts checks to the listed destination IDs; `--strict` makes warnings fail as well as errors.
- `mblast approve <slug> [--only a,b]` checks and displays drafts for interactive approval. The terminal is required; `--only` must name enabled destinations. Editing an approved draft or relevant configuration can invalidate its approval.
- `mblast publish <slug> [--yes] [--stage] [--only a,b] [--force] [--open] [--assist]` checks approvals and defaults to a dry run showing payloads. `--yes` executes publishing and handoffs. `--stage` limits execution to unpublished DEV and Hashnode drafts. `--only` selects enabled destinations. `--force` permits a changed social post to be posted again or API publishing after a prior handoff; it does not bypass approval or an unknown outcome. `--open` opens handoff pages and copies draft-policy text when executing. `--assist` instead walks handoffs interactively, opening pages and collecting outcomes; it requires a terminal and cannot be combined with `--yes`, `--stage`, `--force`, or `--open`. It can be combined with `--only`.
- `mblast mark <slug> <destination> --url U` records an HTTP(S) permalink as published. Alternatively, `--not-posted` clears a pending or unknown outcome for retry after you have verified it was not posted. The destination must be enabled.
- `mblast status <slug>` displays destination status, URL, timestamp and error.
- `mblast launch` shows the project launch-directory checklist. `mblast launch --mark <directory> --url U` records a listing with an HTTPS URL; both options are required together. This state is project-wide, not campaign-specific.

For a handoff, you are responsible for submitting in the browser and recording the resulting permalink. See [destinations](destinations.md) for AI policies and access modes.
