# Architecture

Market Blaster is a local CLI that turns repository evidence into reviewed, destination-specific announcements. It does not operate a hosted service or automate websites. The [guide](guide.md) covers setup and commands; the [design](design/market-blaster.md) and [auth and reach decisions](design/auth-and-reach.md) give the rationale and research.

## Container view

The editable diagram source is [`diagrams/architecture.json`](diagrams/architecture.json). It describes a C4 container view, read left to right. The CLI, drafting agent and browser are separate processes on the user's machine; the project files and Keychain are local stores, and platform APIs and websites are external systems. The diagram renderer generates the legend from the domains in the spec.

## Flow

1. `brief` gathers commits, a bounded diff, optional PR information and changelog material into a campaign brief with evidence anchors. `new` chains brief, draft and check.
2. `draft` starts the configured agent in a temporary workspace with the brief, drafting skill and selected, secret-free settings. It copies back only requested, valid draft files. The environment is allowlisted; the brief is treated as untrusted data. This is process and workspace separation, not an OS sandbox: an agent runs with the user's privileges.
3. `check` validates drafts and reports grounding and length findings. Grounding is heuristic, not proof of factual accuracy. A person reviews and approves drafts interactively; the approval hash covers the unresolved content and relevant publishing settings. Editing them requires approval again.
4. `publish` without `--yes` previews payloads. For a real run it checks approvals, performs available API verification and length preflight, then publishes in dependency order. Links to other destinations resolve from recorded published URLs; a missing dependency blocks its dependent destination. A configured canonical home supplies canonical URLs where supported.
5. API adapters publish or update where supported. Handoff destinations instead return a compose URL and text or talking points. `publish --assist` opens the user's normal browser and asks for a permalink; the person writes or reviews and submits the post. HN receives only the original title and link, not generated text.

## State and failure boundaries

Campaign folders hold `brief.md`, `drafts/` and `state.json`. State records approvals, destination outcomes, IDs and URLs; writes use a temporary file and rename, and a per-campaign lock serializes operations. Before a new API request the CLI records `pending`; a successful response records `published` or `staged`. Ambiguous outcomes, including timeouts and server failures, are `unknown`; a pending or unknown outcome blocks another attempt until the user investigates and resolves it with `mblast mark`. Updates preserve the prior article state and record an uncertain last attempt separately. Only rate limits and connection-refused errors are retried, at most twice. This reduces duplicate risk but cannot guarantee exactly-once delivery across a network.

Unchanged published content is skipped; supported article adapters update existing IDs. Changed social posts require `--force`. Handoffs remain `handoff` until a human records a permalink. Preflight reduces partial publication but cannot make multiple platform writes transactional.

## Integration and trust boundaries

`Destination` adapters provide payloads and, as applicable, API verification, creation, updates or handoff information. DEV, Hashnode, Gist, Bluesky, Mastodon and GitHub Discussions have project adapters; Crosspost supplies X and LinkedIn strategies and Nostr support. Platform availability and account requirements differ; `doctor` reports the configured mode. External calls and provider behavior remain outside the CLI's control.

Credentials resolve from shell environment, project `.env`, then macOS Keychain; see [ADR 0003](adr/0003-keychain.md). The drafting process is not passed publishing credentials by the CLI, but its user privileges and accessible home directory are not a security sandbox. Browser sessions remain in the user's browser. For the runtime and manual posting choices see [ADR 0001](adr/0001-runtime.md) and [ADR 0002](adr/0002-handoffs.md).
