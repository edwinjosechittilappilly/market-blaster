# ADR 0002: Human-operated browser handoffs

- **Status:** Accepted
- **Context:** [Auth and reach plan](../design/auth-and-reach.md), [browser relay research](../research/browser-relay.md)

## Context

Some destinations have no usable public write API, restrict access, or have terms that prohibit website automation. Others have community rules limiting AI-written content. An authenticated browser session does not grant the CLI permission to script a site, even if a human makes the final click.

## Decision

Use supported APIs when enabled and available; otherwise provide a compose, share, import or editor URL for the user's normal browser. Never automate website posting or read browser credentials. In interactive `publish --assist`, the user works through handoffs and may enter each resulting permalink; `mblast mark` also records a handoff. The CLI records `handoff`, not `published`, until a permalink is supplied.

Apply destination AI policies. HN receives an original title and URL only; the person writes any accompanying text. Outline destinations receive talking points and evidence, not clipboard-ready generated posts. Draft destinations may have text copied for the person to review and paste. URL prefill is destination-dependent and may fail or change.

## Alternatives

- Browser relay or scripted browser interaction would depend on site internals and can violate platform terms. A final human click does not eliminate that issue.
- API-only support would exclude destinations without practical write access.
- Requiring a paid intermediary or gated API for every destination would add cost and access dependencies without removing the need for human community judgment.

## Consequences

Handoffs take human time, do not guarantee a successful post, and need a manually supplied permalink for recorded publication. Browser login state stays with the user. Community policies and URL behavior can change, so users must check current rules; the tool's policy categories are not legal advice or a substitute for review.
