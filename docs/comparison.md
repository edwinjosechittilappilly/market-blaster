# Comparison

Market Blaster starts with a shipped change and creates evidence-linked, editable drafts for a person to review. It combines local campaign state and direct API publishing with explicit manual handoffs. It is not a scheduler, analytics suite or guarantee that platform policies or APIs will remain unchanged.

The comparison below summarizes a documentation and repository survey conducted on 2026-11-21, not a hands-on audit. Product capabilities, pricing, access and policies can change. See the [full research](research/existing-skills-and-tools.md) for sources, dates, caveats and additional tools.

| Tool | Strength | Difference or trade-off |
|---|---|---|
| [Pipepost](https://github.com/MendleM/Pipepost) | Article syndication, canonical wiring and social variants through MCP | Starts from an article; the survey did not find a documented PR-to-evidence workflow. Its canonical behavior was not tested hands-on. |
| [content-distribution-mcp](https://github.com/AutomateLab-tech/content-distribution-mcp) | Per-channel variants, per-channel state, publishing and browser-required results | Expects variants from an agent and uses MCP; documented local profiles contain platform credentials in YAML. Its idempotency claims were not independently tested. |
| [Crosspost](https://github.com/humanwhocodes/crosspost) | JavaScript library, CLI and MCP with multiple platform strategies | A useful transport rather than the whole evidence, approval and campaign lifecycle. Market Blaster reuses selected strategies and implements adapters where it needs different semantics. |
| [Typefully](https://github.com/typefully/agent-skills) | Managed social drafts, scheduling, media and analytics, with agent integration | Requires its service and connected accounts; its listed social channels do not cover DEV or Hashnode. |
| [Postiz](https://github.com/gitroomhq/postiz-app) | Managed or self-hosted social scheduling, analytics, API and MCP | A broader scheduler to operate or subscribe to, rather than this local evidence-to-announcement workflow. Self-hosted product is AGPL-3.0. |
| [Buffer](https://developers.buffer.com/) | Hosted multi-channel scheduling and a documented GraphQL API | Another account and service; API feature and network parity were not verified in the survey. |
| [DEV CLI](https://github.com/sinedied/devto-cli) | DEV article creation and updates, with dry-run support | Focused on DEV rather than multi-destination evidence, approvals and handoffs. |

These tools overlap substantially: article syndication, channel variants, agent integrations and duplicate prevention are not novel to Market Blaster. Its intended distinction is their combination with source-change evidence, local review and destination-specific access policies. Choose a scheduler when queues and analytics are the primary need; choose a focused platform tool for a single-channel workflow.
