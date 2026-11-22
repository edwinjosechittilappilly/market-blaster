# ADR 0003: Machine-local Keychain credentials

- **Status:** Accepted
- **Context:** [Auth and reach plan](../design/auth-and-reach.md#where-credentials-live), [auth research](../research/auth-and-access.md)

## Context

Publishing credentials are reused across projects but should not be committed with campaign files or passed to the drafting agent. CI and occasional overrides also need a noninteractive credential source. Browser sessions are separate from API credentials.

## Decision

On macOS, store optional machine-wide credentials as generic passwords in Keychain under service `market-blaster`, keyed by environment variable name. `mblast auth set` accepts hidden input; `auth list` reports presence, not values. The CLI resolves nonempty values in order: shell environment, project `.env`, then Keychain. Environment variables support CI and one-off overrides; `.env` provides a project-local alternative. Non-macOS users can use environment variables or `.env` instead.

LinkedIn's OAuth command uses a loopback callback and stores its token and issue date; app credentials are configured separately. The drafting subprocess receives an allowlisted environment rather than the publishing environment. This is not a sandbox against an agent running with the user's privileges and access to their home directory.

## Alternatives

- Environment or `.env` only is portable and remains supported, but requires provisioning each shell or project and can leave plaintext secrets on disk.
- Credentials in project config or campaign state would make accidental commits and duplication across projects more likely.
- A cross-platform secret manager would broaden native storage support but add another dependency and operating model.

## Consequences

Keychain integrates with macOS and avoids storing these credentials in project files, but does not itself protect a compromised user account or process. An existing shell or `.env` value overrides Keychain, which can obscure a newly rotated value. Users remain responsible for protecting `.env`, scoping and rotating credentials, and securing their browser sessions. The implementation uses the macOS `security` command and never prints credential values in `auth list`.
