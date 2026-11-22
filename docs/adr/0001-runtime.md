# ADR 0001: Node and TypeScript without a build step

- **Status:** Accepted
- **Context:** [Design](../design/market-blaster.md#runtime-and-install), [OpenSpec decisions on GitHub](https://github.com/edwinjosechittilappilly/market-blaster/blob/main/openspec/changes/market-blaster/design.md#decisions)

## Context

The CLI needs a small local installation, platform adapters and access to the JavaScript Crosspost library. It should be runnable and testable directly from the source checkout without generating a separate distribution.

## Decision

Use Node.js 22.18 or later to execute TypeScript via built-in type stripping. `bin/mblast.mjs` imports the TypeScript entry point. Install dependencies in a clone and use `npm link` to expose `mblast`; Node's type stripping does not apply to TypeScript under `node_modules`, so the linked command must resolve to the checkout. Use Crosspost selectively where its maintained strategies fit and implement destination-specific adapters where additional behavior is needed.

## Alternatives

- A Python CLI with independently implemented adapters would introduce a second transport implementation, including X OAuth signing.
- A compiled or bundled JavaScript distribution would support a different installation model, but adds a build and artifact lifecycle that the source-checkout workflow does not need.
- Crosspost alone provides useful transports, but not the required campaign approvals, state, canonical handling and destination-specific behavior.

## Consequences

There is no build step, but users need a supported Node version and a retained source checkout; this is not a conventional precompiled npm distribution. Type stripping is not type checking: development uses a separate TypeScript check. Crosspost remains an external dependency, and native adapters must track upstream platform changes.
