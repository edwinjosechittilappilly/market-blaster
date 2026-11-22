# Credentials and security

Store only the credentials for destinations you use. Handoff destinations do not require API credentials. See the [guide](guide.md) for project setup and publishing.

## Where values come from

For each non-empty value, Market Blaster uses the first available source in this order:

1. The process environment (including variables exported in your shell).
2. `.env` in the project root, next to `market-blaster.yml`.
3. On macOS, the Keychain item for that name, under service `market-blaster`.

Empty values do not override a lower-priority value. Keychain is queried only for recognized credential and host names. For GitHub destinations, if `GITHUB_TOKEN` is still unset, the publisher and `doctor` also try `gh auth token`. `mblast auth list` reports the first three sources or `unset`, not the `gh` fallback; `mblast doctor` can report `gh`. Neither command prints credential values. `mblast doctor --online` additionally makes authenticated verification requests; it is not merely a local source check.

On macOS, set a recognized name with a hidden terminal prompt:

```sh
mblast auth set DEV_API_KEY
mblast auth list
```

To supply a value from a secret manager without putting it in command arguments, pipe its output to `mblast auth set DEV_API_KEY --stdin`. `--stdin` requires piped input and removes one trailing newline. Avoid commands that embed a literal secret in the shell command line: shell history and process arguments can expose it. The Keychain writer itself sends hex-encoded secret data to `security` over stdin, not in its argument list; encoding is not encryption and the value remains accessible to the processes handling it.

Alternatively, `mblast init` creates `.env.example` and adds `.env` to `.gitignore`. Copy the example to `.env` and fill in the values, or use environment variables. On non-macOS, use `.env` or the environment; `auth set` requires macOS Keychain. Keep `.env` private, restrict its file permissions, and never commit it or copy it into logs, tickets, or artifacts. Environment variables can also be inherited by child processes or exposed by diagnostics; use your execution environment's secret facilities and avoid printing them.

## Destination setup

| Destination | Credentials and setup |
|---|---|
| DEV | `DEV_API_KEY`: dev.to → Settings → Extensions → DEV Community API Keys. |
| Hashnode | `HASHNODE_TOKEN` and `hashnode.publicationId` in config; the guide notes API access requires Pro. Create the token under Hashnode Settings → Developer. |
| GitHub Gist | `GITHUB_TOKEN`, or an authenticated `gh` with Gist access (`gh auth refresh -s gist`). |
| GitHub Discussion | `GITHUB_TOKEN` or `gh` authentication with permission for the target repository's discussions; configure `githubDiscussion.repo` and `githubDiscussion.category`. |
| Bluesky | `BLUESKY_IDENTIFIER` and `BLUESKY_APP_PASSWORD`. Create an app password in Settings rather than using your account password. `BLUESKY_HOST` can override the configured host. |
| Mastodon | `MASTODON_TOKEN` from an application on your instance, with `read:accounts` and `write:statuses`; set `mastodon.host` in config or `MASTODON_HOST`. The guide's example uses hachyderm.io and `mastodon.maxChars: 2263`. |
| LinkedIn | `LINKEDIN_ACCESS_TOKEN` and `linkedin.api: true` for API mode; otherwise use handoff. The macOS authorization flow is below. |
| X | Handoff by default. The optional API mode needs `x.api: true`, `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, and `X_ACCESS_SECRET`; API access may be paid. |
| Nostr | `NOSTR_PRIVATE_KEY` for API publishing; protect this signing key as a high-value secret. |
| HN, Reddit, Threads, Medium, Product Hunt, Substack, Lemmy, newsletter | Manual handoff; no API credentials required. |

### LinkedIn authorization on macOS

In the [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps), create an app, add **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**, and register `http://localhost:8723/callback` as an authorized redirect URI. Then:

```sh
mblast auth set LINKEDIN_CLIENT_ID
mblast auth set LINKEDIN_CLIENT_SECRET
mblast auth linkedin
```

The command opens an authorization URL when supported, listens for the localhost callback, and stores `LINKEDIN_ACCESS_TOKEN` and `LINKEDIN_TOKEN_ISSUED` in Keychain. It prints the token's calculated expiration. Shell or `.env` values for those names override the newly stored values; remove stale overrides. The guide notes tokens last about 60 days; `doctor` warns when a recorded issue date is over 50 days old. Reauthorize with `mblast auth linkedin`. On non-macOS this flow cannot save its result to Keychain; provide an access token through the environment or `.env` instead.

## Keychain access and agent boundaries

macOS Keychain encrypts stored items at rest. Entries use service `market-blaster` and the variable name as the account. Writes use `security add-generic-password -U` with `-T ""`: they do **not** automatically trust the creating application. Access is subject to Keychain's access controls and may require user approval. Do not select an unconditional allow option for an untrusted process. Existing Keychain policy, permissions and user decisions matter; this is not a guarantee that every read will prompt. A failed or denied Keychain lookup is treated as unavailable, so check the source and macOS Keychain permissions if a value appears unset.

What this means in practice:

| You click | Effect | Safety |
|---|---|---|
| **Allow** (each time) | macOS asks again on the next `doctor` or `publish`. Each credential read shows a prompt naming `security` | Strongest. Nothing reads the secret without you clicking |
| **Always Allow** | No more prompts for that item | Convenient. `/usr/bin/security` joins the item's trusted list, so **any** process running as you, an agent included, can then read it silently with `security find-generic-password` |
| **Deny** | Market Blaster treats the value as unset | `doctor` shows it as missing |

Recommendation: click **Allow** for the publishing tokens that matter most (LinkedIn, GitHub with repo scope, Nostr), and
**Always Allow** only for low-impact tokens. Run the drafting agent in a session where you are present to see an
unexpected prompt. If you clicked Always Allow by mistake, open Keychain Access, find the `market-blaster` item, and
remove `security` from its Access Control list.

Drafting uses a temporary workspace and filters the environment passed to the agent, but this is **not a security sandbox**. The agent runs as your user and may be able to read files, request Keychain access, or alter approvals. Use a trusted agent and an actual OS-level sandbox where available; permission modes alone are not equivalent. Do not approve Keychain access requests you do not recognize. Keep publishing credentials out of untrusted agent sessions and use separate accounts or machines when stronger isolation is needed.

Drafts and briefs are ordinary files, not secret stores: do not put credentials in them. Drafting copies the brief into a temporary workspace, passes a filtered environment to the agent, and prints the agent's report; neither the report nor draft content is guaranteed to be scrubbed. Publish state records statuses, URLs, titles and errors. Publish preflight and failure paths redact exact known destination values from errors before output or persistence, but this is best effort: the shared redactor skips values shorter than four characters, and transformed, partial, unknown or independently printed secrets may remain. Review drafts, output and state before sharing; avoid placing credentials in URLs or post content.

## Least privilege, rotation, and CI

- Create separate, narrowly scoped credentials for each service and environment; grant only the account, repository and permissions needed. Prefer app passwords or dedicated tokens to account passwords. Handoff avoids storing API credentials for that destination.
- If a credential is exposed, revoke it at the provider promptly, issue a replacement, and update every location that supplies it. For ordinary rotation, replace the value in its active source, then revoke the old credential according to the provider's procedure. Updating Keychain does not override a stale shell or `.env` value: use `mblast auth list` or `mblast doctor` to find the active source. Remove obsolete copies from shell configuration, `.env`, Keychain and CI secret stores as appropriate. Deleting a local copy alone does not revoke provider access.
- CI draft checks do not need publishing credentials. For jobs that genuinely need a secret, inject it through the CI provider's secret store as an environment variable, limit the job and token permissions, avoid untrusted pull requests and shell tracing, and do not print or upload secrets. Rotate and revoke CI credentials at the provider too. See the [CI example](guide.md#6-use-it-in-ci) for credential-free draft checking.

### Provider rotation and revocation

Provider interfaces change; use the account or developer settings for the actual credential and confirm the old access is revoked. Lifetimes for DEV, Hashnode, Bluesky app passwords, and Nostr keys are not established by this project's research; Mastodon depends on the server and X on the authentication flow. Do not assume expiry will protect a leaked credential.

| Provider | Scope and revocation |
|---|---|
| DEV | Use a dedicated API key; granular scopes were not established. In DEV Settings → Extensions → DEV Community API Keys, delete the exposed key and create a replacement. |
| Hashnode | Use a dedicated personal access token; granular scopes were not established. In Settings → Developer, revoke/delete the affected token and create another. |
| GitHub | For Gists use classic `gist` scope or fine-grained Gists write; for Discussions use repository-limited Discussions write. In GitHub Settings → Developer settings → Personal access tokens, delete/revoke the affected PAT. If using `gh`, remove the affected authorization in GitHub's authorized applications settings and reauthenticate with only the permissions needed. |
| Bluesky | Use a separate app password. In Settings → App passwords, revoke/delete that password and create another; session tokens are separate and expire. |
| Mastodon | Grant only `read:accounts` and `write:statuses` for this workflow. In your instance's account settings, revoke the affected authorized application/token; reauthorize or create an application as needed. Server interfaces and token lifetimes vary. |
| LinkedIn | The built-in flow requests `openid`, `profile`, and `w_member_social` for personal posting. Remove the app's authorization in LinkedIn account settings to revoke access, then reauthorize; if the client secret is exposed, rotate it in the developer app as well. Reauthorization generally recurs around 60 days, subject to the returned expiry. |
| X | Use a dedicated app with only the access required for posting. Revoke its connected-app authorization in X account settings; if app keys or user access credentials are exposed, regenerate them in the developer portal and update all four configured values as applicable. Lifetime depends on the flow. |
| Nostr | A private key is a signing identity, not a provider-issued token: there is no central revocation that invalidates signatures everywhere. If compromised, stop using it, generate a new identity, and notify your audience through trusted channels; remove old copies. |
