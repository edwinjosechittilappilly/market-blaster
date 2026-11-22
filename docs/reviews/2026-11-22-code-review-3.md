# Code review 3 (verification; anthropic/claude-opus-5-5 via slipway run review)

| # | Finding | Fixed? | Evidence |
|---|---|---|---|
| 1 | LinkedIn and Nostr outcomes classified `failed` | **Yes; tests partial** | `crosspost.ts:24-35`: problems reading a successful response raise `UncertainResponseError`. `crosspost.ts:39-40`: LinkedIn's `^(\d{3}) ` message becomes an `HttpError`; this matches the library's real format (`linkedin.js:122,228`). `publisher.ts:37-40`: any error that is not a `UserError` or a non-429 4xx becomes `unknown`, which covers Nostr's "Failed to publish to any relays". Tests: `adapters.test.ts` "Crosspost timeout and response mapping" (:95). They still use fake strategies, not the real classes with stubbed `fetch`/`WebSocket`, and no test covers a Nostr relay failure. |
| 2 | Agent isolation and Keychain readable by the agent | **No** | The guide now states the limit (`docs/guide.md:120-125`) and items are created with `-T ""` (`keychain.ts:29`). The approval hash is still an unkeyed SHA-256 in a writable `state.json` (`state.ts:85-90`), so the threat remains. No test. |
| 3 | Secret passed in argv | Yes | `keychain.ts:25-36`: `security -i` reads the value as hex on stdin, with a 4096-byte guard. `auth.test.ts` "keychain errors never expose secret…" (:19) asserts argv is `["-i"]` and the hex input. `security -i` does return a non-zero exit on failure (checked locally), so failures are still detected. |
| 4 | Tests use the real Keychain | Yes | `io.ts:24`, `cli.ts:101`, `env.ts:27` (defaults to no lookup), `keychain.ts:7-9` (refuses the real runner under `NODE_TEST_CONTEXT`). Tests: `auth.test.ts` "doctor uses its injected Keychain lookup" (:82) and the guard assert at :27. The suite now runs in about 1.2 s. |
| 5 | No preflight read for X and Nostr | Yes (spec amended) | `publishing/spec.md:33-34`; `publisher.ts:101`. Test: `publish.test.ts` "X API publishes without verification…" (:110). |
| 6 | Reddit prefills the AI title | Yes | `handoffs.ts:10`. Test: `adapters.test.ts` "Gist uses same filename…" (:111) asserts there is no `title` parameter. |
| 7 | Assist and publish approval rules differ | **Yes; no negative test** | `state.ts:15` `needsApproval`, used at `publisher.ts:74` and `assist.ts:34`. The assist fixture now approves Reddit (`assist.test.ts:21`), but no test asserts that an unapproved outline is refused. |
| 8 | Outline drafts skip grounding | Yes | `check.ts:47` grounds title and body; `:39-40` skip only length. Test: `drafts.test.ts` "outline grounding checks title and body but skips body length" (:103). |
| 9 | Invalid DEV tag crashes the dry run | **Mostly** | `check.ts:26-29` makes it an error; `publisher.ts:89-92` catches it in the dry run. Tests: `drafts.test.ts` "DEV tag rules are checked before publishing" (:122) and `publish.test.ts` "DEV invalid tags are reported rather than thrown in dry run" (:216). The skill's `reference/destinations.md:3-4` still does not state the tag rule. |
| 10 | GitHub Discussions GraphQL errors and preflight | Yes | `github-discussion.ts:16-24` returns data despite `errors` and makes create/update errors uncertain; `:47` runs `lookup` in `verify`; `config.ts:78-81` requires repo and category. Tests: `destinations.test.ts` "discussion preflight validates category…" (:47) and `publish.test.ts` "approval includes discussion settings…" (:188). |
| 11 | Renewed LinkedIn token silently overridden | Yes | `auth.ts:119-121`. Test: `auth.test.ts` "LinkedIn loopback…" (:40) asserts warnings for both the shell and `.env` sources. |
| 12 | Skill contradicts `meta.ts`; `brand.yml` incomplete | Yes | `SKILL.md:15-16,59`; `draft.ts:38-39` adds the missing config blocks and `aiPolicies`. Tests: `drafts.test.ts` "skill covers every destination" (:70) and "draft runs agent with restricted environment…" (:36). |
| 13 | Nostr records a `nostr:` URL | Yes | `crosspost.ts:28-29`. Test: `adapters.test.ts:104-105` (fake strategy). |
| 14 | Hashnode "paid offering" hint is dead code | Yes | `http.ts:11-14` uses `redirect: "manual"`. I checked real Node fetch locally: it returns `301 ok=false type=basic`, so the hint fires. Test: `adapters.test.ts` "HTTP errors are scoped…" (:73). |
| 15 | `auth set FOO` doesn't list known keys | Yes | `auth.ts:61`; `auth.test.ts:34`. |
| 16 | Authorization URL never printed | Yes | `auth.ts:98,101`. Test: `auth.test.ts` "LinkedIn loopback…" (:40), with an opener that throws. |
| 17 | GitHub Discussions config key mismatch | Yes | `state.ts:86`. Test: `publish.test.ts` "approval includes discussion settings…" (:188). |
| 18 | Newsletter targets: only the first is used; duplicates opened | Yes | `handoffs.ts:26-29` deduplicates; `publisher.ts:131` and `assist.ts:60` print every target. Tests: `publish.test.ts` "newsletter prints each distinct target" (:207) and `destinations.test.ts:42`. |
| 19 | LinkedIn handoff without a link has no URL | Yes | `crosspost.ts:66`; `adapters.test.ts:108`. |
| 20 | Lock error matched by string; empty lockfile never stale | Yes (but see new concern 2) | `state.ts:11-13` adds `LockError`; the 6 catch sites are removed; `state.ts:28-31` treats an empty pid as stale. Tests: `publish.test.ts` "concurrent publish is blocked…" (:147) and "empty and invalid lock files are stale" (:199). |
| 21 | Dead code and loose validation | **Partly** | `config.ts:73` (newsletter targets) and `:74-77` (Lemmy bare hostname) are fixed, tested at `publish.test.ts:188`. `keychainList` (`keychain.ts:39`) is still unused. |
| 22 | Spec drift | Yes | The spec delta is committed; `publishing/spec.md:41` includes `nostr` and `github-discussion`; Discord is marked deferred and `linkedin.api: false` is explained in `auth-and-reach.md`. |

## Round 1 items marked "Partly"

| # | Finding | Fixed? | Evidence |
|---|---|---|---|
| 4 | Dropped-connection errors classified `failed` | **Yes; tests partial** | The allowlist is inverted at `publisher.ts:37-40`. No test sends a plain `Error` with no code through `publishCampaign`. |
| 7 | X and LinkedIn timeout and error mapping | Yes | `crosspost.ts:39-40`. `adapters.test.ts:102-103` now throws the real message shape, `Error("429 …")`, though still from a fake strategy. |
| 8 | Hashnode redirect | Yes | Same evidence as round-2 #14. |
| 9 | Mastodon limit at check time | Yes | `mastodon.ts:20-25` falls back to `/api/v1/instance` on a 404. Test: `adapters.test.ts` "Mastodon falls back to v1 instance on older servers" (:146). |
| 23 | Adapter and redaction tests too narrow | **Partly** | There is still no test that publish output and `state.json` contain no secrets, and no payload schema validation. |

## New issues introduced by the fixes

1. **concern: HN submission is blocked after `mark --url`, or when the home was published before this commit.**
   - **Where:** `publisher.ts:114` and `assist.ts:32` read only `state[home].title`. That title is written only at `publisher.ts:170`; `mark.ts:28` never sets it, and state from older versions doesn't have it. `config.hn.title` is ignored when the home is a destination.
   - **Seen:** I ran a throwaway script after `mark devto --url`, with `hn.title` set. The dry run showed `t=Real title`, but `--yes` printed `hn: skipped: published home title unavailable; set hn.title for an external canonical home` and exited 1. The message tells the user to do something that has no effect.
   - **Fix:** fall back to the home draft's title, as the dry run already does (`state[home]?.title ?? checked.drafts.get(home)?.title`), in both places. Then fix the message.

2. **concern: treating an empty lockfile as stale lets two processes hold the lock at once.**
   - **Where:** `state.ts:23` creates the lockfile empty, and the pid is written later at `:41`. A second process that reads it in that window counts it as stale (`:31`), deletes the live lock (`:37`) and takes it. When the first process finishes, its `finally` (`:45`) deletes the second process's lock.
   - **Risk:** the window is microseconds, but this lock is what stops two publishes running together.
   - **Fix:** create the lock with its pid already inside: write `${lock}.${pid}`, then `linkSync` it to the lock path (`EEXIST` means held). Or count an empty lock as stale only when its mtime is older than about 10 s.

3. **concern: Keychain items created with `-T ""` trust no application.** [INFERENCE: from `security(1)` ACL semantics; I didn't try it against the real Keychain.]
   - **Prompts:** every `find-generic-password -w` (`keychain.ts:19`) asks for confirmation. `env.ts:39-43` reads every `AUTH_ENV_VARS` key that isn't already set, so `publish`, `doctor` and `auth list` show one prompt per stored credential.
   - **Silent fallback:** without a GUI (SSH), or when the user denies the prompt, `keychainGet` swallows the error (`keychain.ts:20-21`) and the credential reads as unset. For `x` and `linkedin` with `api: true`, `mode.ts:25` then quietly switches to handoff.
   - **Hole reopens:** "Always Allow" adds `/usr/bin/security` to the item's access list, which brings back the exposure round-2 #2 described.
   - **Fix:** in `keychainGet`, treat only exit 44 (item not found) as unset and raise a `UserError` naming the key for any other failure. Look up only the keys of enabled destinations. Close #2 with a keyed approval rather than the Keychain ACL.

4. **concern: the inverted classification no longer matches the spec.**
   - **Where:** `publisher.ts:37-40` now records any 5xx (including 500), 3xx and an exhausted 429 as `unknown`. `publishing/spec.md:62-65,97` says `failed` on an HTTP error and `unknown` only for 502/503/504/522/524.
   - **Effect:** a 429 means the request was not processed, so after retries it should be `failed`. Now it needs a manual `mark --not-posted`. The test "retries 429 … but not 500" (`publish.test.ts:80`) doesn't check the resulting status.
   - **Fix:** return `failed` for an exhausted 429, and either amend the spec to "any non-4xx is unknown" or narrow the 5xx set to match it. Then assert the status in that test.
