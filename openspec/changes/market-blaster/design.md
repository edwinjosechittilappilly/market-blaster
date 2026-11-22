# Design

The full design, alternatives and cross-cutting checks are in
[`docs/design/market-blaster.md`](../../../docs/design/market-blaster.md), which was revised after the
[design review](../../../docs/reviews/2026-11-22-design-review.md). This file records the decisions the tasks depend on.

## Context

This is a greenfield repo. The research in `docs/research/` fixes the platform split:

- **API:** DEV, Gist, Bluesky, Mastodon.
- **Opt-in API:** Hashnode (needs Pro), LinkedIn (needs `w_member_social`), X (paid).
- **Handoff:** HN, Reddit, Medium, Threads, Product Hunt, Substack.

## Goals / Non-Goals

**Goals:**
- Adding a platform takes one file implementing the `Destination` interface.
- No build step.
- Tests make no network calls; `fetch` is injected.

**Non-Goals:** image upload, schedulers, analytics, OAuth flows inside the CLI. The guide documents how to obtain each
token.

## Decisions

- **Node and TypeScript with type stripping, installed with `npm link`.** Crosspost is a JavaScript library, and Node
  22.18+ runs `.ts` files outside `node_modules`.
  - Rejected: Python with its own adapters, because the X OAuth 1.0a signing would have to be reimplemented.
- **Which adapters are ours and which come from Crosspost:**

  | Adapter | Source | Reason |
  |---|---|---|
  | DEV, Hashnode, Gist, Bluesky, Mastodon | ours | Each needs something Crosspost lacks (see below) |
  | X, LinkedIn | Crosspost | Signing and headers are the hard part, and Crosspost maintains them |

  What our adapters need that Crosspost does not provide:
  - canonical URLs;
  - update and staging;
  - Bluesky link facets and link cards;
  - Mastodon's per-instance character limit and idempotency key.
- **The `Destination` contract:**

  ```ts
  interface Destination {
    id: DestinationId;
    kind: "article" | "social" | "handoff";
    env: string[];                                  // variables that enable API mode
    limit(text: string, ctx): { length: number; max: number } | null;
    verify?(ctx): Promise<void>;                    // one authenticated read
    create?(post: ResolvedPost, ctx): Promise<{ id: string; url: string }>;
    update?(id: string, post: ResolvedPost, ctx): Promise<{ id: string; url: string }>;
    handoff?(post: ResolvedPost, ctx): { url?: string; prefills: "full" | "link" | "none" };
    payload(post: ResolvedPost, ctx): unknown;      // printed by dry run
  }
  ```

  `ctx` carries `fetch`, `env`, `config`, and `timeoutMs`.
- **The state file and the status machine.**
  - The state is written atomically (temp file, then rename) after every status change.
  - A destination moves to `pending` before its request. The outcome of the request sets the next status:

    | Outcome | Status |
    |---|---|
    | Success | `published` |
    | HTTP error | `failed` |
    | Abort or timeout | `unknown` |

  - Approvals are stored in the same file: `approvedHash` per destination.
- **The content hash** is SHA-256 over `destination`, `title`, `canonical` and the body text *before* link resolution.
  Approval therefore stays valid once links are resolved.
- **Errors are classified by kind.** A `TimeoutError` or an abort becomes `unknown`. `ECONNREFUSED` and 429 are retried
  up to two times with backoff. Any other HTTP status becomes `failed`, with the status code and the first 200
  characters of the body after secrets are redacted.
- **The drafting agent:**
  - `agent.command` defaults to `["omp", "-p"]`, and the prompt is the last argument.
  - Its environment is limited to `PATH`, `HOME`, `USER`, `LANG`, `TERM`, `TMPDIR` and `XDG_*`.
  - It runs with the working directory set to the project.
- **DEV defaults to unpublished articles** (`devto.publish: false`). Setting `devto.publish: true` creates them
  published.
- **Grounding check.** `check` collects these tokens from a draft:
  - numbers with units (`3x`, `40%`, `200ms`);
  - semver strings;
  - code spans in backticks.

  It warns on any of them that the brief text does not contain. This is a heuristic.

## Risks / Trade-offs

- [Grounding heuristic produces false positives] → it warns only; `--strict` turns warnings into errors for CI use.
- [Reddit and Threads prefill URLs are undocumented] → the handoff text is also copied to the clipboard, so it still
  works when the prefill is ignored.
- [`approve` blocks unattended CI publishing] → intended. CI can run `check` and a dry run. Publishing always needs a
  human with a TTY.

## Migration Plan

This is a new tool. To roll back, stop using it.
