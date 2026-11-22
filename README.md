<p align="center">
  <img src="docs/assets/banner.svg" alt="Market Blaster: ship a feature and announce it where developers read. Drafts grounded in your change, human approval, API publishing and handoffs, no browser automation, and credentials in Keychain." width="100%">
</p>

<p align="center">
  <a href="https://github.com/edwinjosechittilappilly/market-blaster/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/edwinjosechittilappilly/market-blaster/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://edwinjosechittilappilly.github.io/market-blaster/"><img alt="Documentation" src="https://img.shields.io/badge/docs-online-087f8c"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
  <img alt="Works with omp, Claude Code and Codex" src="https://img.shields.io/badge/works%20with-omp%20%C2%B7%20Claude%20Code%20%C2%B7%20Codex-ff5a3c">
  <img alt="Node 22.18 or newer" src="https://img.shields.io/badge/node-%3E%3D22.18-43853d">
</p>

# Market Blaster

Market Blaster turns a shipped change into platform-specific posts. It gathers evidence from a git range, PR and
CHANGELOG, asks an agent to draft from that brief, and checks the results. You edit and approve each draft in your
terminal before publishing through APIs or completing a manual handoff.

## Quickstart

Requires Node 22.18+, git, access to this private repository, and a configured drafting agent. Install from a clone:

```bash
gh repo clone edwinjosechittilappilly/market-blaster
cd market-blaster
npm install
npm link
mblast install-skill
```

In the repository you want to announce:

```bash
mblast init
# Edit market-blaster.yml: brand, destinations and agent.command
mblast auth set DEV_API_KEY                      # macOS Keychain; use .env or shell elsewhere
mblast new my-feature --range v1.2.0..HEAD       # add --pr 42 when available
$EDITOR campaigns/my-feature/drafts/*.md
mblast check my-feature
mblast approve my-feature                        # interactive approval of each draft
mblast publish my-feature                        # dry run
mblast publish my-feature --yes                  # publish approved API destinations
mblast publish my-feature --assist               # complete handoffs and record permalinks
mblast status my-feature
```

`--assist` opens official pages for you to submit; it does not click Post. The example below uses a fake drafting agent
and dummy DEV and Bluesky credentials. The final command is a dry run, so it sends nothing.

<p align="center"><img src="docs/assets/demo.svg" alt="A terminal session creates a demo campaign, approves its drafts and previews API and handoff destinations without sending anything." width="100%"></p>

## What goes where

| Destination | Publishing mode and draft policy |
|---|---|
| DEV, GitHub Gist, GitHub Discussions | API; editable drafts |
| Bluesky, Mastodon, Nostr | API; editable drafts |
| LinkedIn | Share handoff, or opt-in API; editable draft |
| X | Intent handoff, or opt-in paid API; editable draft |
| Hashnode | API when configured; Hashnode Pro required |
| Hacker News | Manual link and title only; no generated text |
| Reddit, Product Hunt, Lemmy, newsletters | Manual submission; AI talking points only |
| Threads, Medium, Substack | Manual compose, import or editor handoff; editable draft |

`mblast launch` tracks one-time directory submissions separately from campaigns.

## Why not just use X?

[Pipepost](https://github.com/MendleM/Pipepost) cross-publishes articles and generates social variants.
[Typefully](https://typefully.com/), [Postiz](https://postiz.com/) and [Buffer](https://buffer.com/) focus on social
publishing and scheduling. [Crosspost](https://github.com/humanwhocodes/crosspost) is a CLI, library and MCP for
posting across networks. Market Blaster starts with a code change and an evidence-linked brief, then keeps drafts,
terminal approvals and per-destination outcomes in local campaign files. See the
[tool research](docs/research/existing-skills-and-tools.md) for the comparison and its limits.

## Safety

- Approval records a hash of the exact draft; a changed draft needs approval again before publishing.
- The agent receives a temporary workspace and a filtered environment, not publishing credentials or the project
  files. This is **not a security sandbox**: the agent runs as your user. Use your agent's sandbox where available.
- API errors with an uncertain outcome block reposting until you resolve them with `mblast mark`. A lock prevents
  overlapping publish runs.
- There is no browser automation. HN gets a title and link; outline-only destinations require you to write the post.
- macOS credentials can be stored in Keychain. Shell variables and a project `.env` are also supported.

## Documentation

Read the [getting started guide](https://edwinjosechittilappilly.github.io/market-blaster/getting-started/),
[commands](https://edwinjosechittilappilly.github.io/market-blaster/commands/),
[configuration](https://edwinjosechittilappilly.github.io/market-blaster/configuration/),
[destinations](https://edwinjosechittilappilly.github.io/market-blaster/destinations/) and
[credentials](https://edwinjosechittilappilly.github.io/market-blaster/credentials/). The
[full guide](docs/guide.md) is also available in this repository.

## Development

Contributions are welcome. Install dependencies, then run:

```bash
npm test
npm run typecheck
make docs-serve
```

## License

[MIT](LICENSE).
