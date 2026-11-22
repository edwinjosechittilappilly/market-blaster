# Code review 2 (anthropic/claude-opus-5-5 via slipway run review)

## Round 1 findings

| # | Finding | Status | Fix in `src/` | Test in `test/` |
|---|---|---|---|---|
| 1 | X API mode never publishes | Fixed (a spec gap remains, see new #5) | `publisher.ts:104-107` warns "no read check available" and continues | `publish.test.ts:110` |
| 2 | DEV records drafts as published and can unpublish live articles | Fixed | `devto.ts:16-17`, `publisher.ts:81` | `adapters.test.ts:58`, `publish.test.ts:45` |
| 3 | `mark --not-posted` after an update timeout creates a duplicate | Fixed | `lastAttempt` at `publisher.ts:150-152,176`; `mark.ts:21-23` keeps the id | `publish.test.ts:59` |
| 4 | Dropped-connection errors classified `failed` | **Partly** | The allowlist was extended, not inverted (`publisher.ts:37-44`). Plain `Error`s from Crosspost still become `failed` (new #1) | `publish.test.ts:59,179` |
| 5 | Drafting agent can bypass approval and reach credentials | Fixed as asked (temp workspace, env allowlist, `SHELL` removed, copy-back checked); the risk itself remains, see new #2 | `draft.ts:24-68` | `drafts.test.ts:35` |
| 6 | Gateway errors classified `failed` | Fixed for fetch adapters; LinkedIn not covered (new #1) | `publisher.ts:43` | `publish.test.ts:179` |
| 7 | X/LinkedIn have no timeout or error mapping | **Partly** | Timeout race and X `ApiResponseError` are handled. LinkedIn's real `Error("429 …")` has no `.code`, so it still becomes `failed` with no retry. The test fakes `code: 429`, which hides this | `adapters.test.ts:95-102` |
| 8 | Hashnode redirect; credentials follow redirects | **Partly** | `redirect: "error"` and the content-type check are in (`http.ts:11,21`). The "paid offering" hint is dead code (new #14) | `adapters.test.ts:73` |
| 9 | Mastodon limit unknown at check time | **Partly** | Now a warning (`check.ts:38`), and preflight reads the limit (`mastodon.ts:19-21`). There is no `/api/v1/instance` fallback, so preflight fails on Mastodon < 4.0 | `drafts.test.ts:88`, `adapters.test.ts:38` |
| 10 | Skill contradicts `check` | Fixed | `skip:` handled in `drafts.ts:33`, `check.ts:25`, `publisher.ts:79`; `new.ts:17` | `drafts.test.ts:71`, `publish.test.ts:140` |
| 11 | Grounding misses bare numbers | Fixed (outline drafts now skipped, new #8) | `check.ts:43-44` | `drafts.test.ts:79` |
| 12 | Approval hash leaves out tags and config | Fixed (one key mismatch, new #17) | `state.ts:78-83`, `approve.ts:28` | `publish.test.ts:158` |
| 13 | `--stage` posts socials | Fixed | `publisher.ts:64,80` | `publish.test.ts:128` |
| 14 | Failed update demotes a live article | Fixed | `publisher.ts:150-152,176` | `publish.test.ts:59` |
| 15 | `mark --url` keeps a stale hash | Fixed | `mark.ts:29` | `publish.test.ts:121` |
| 16 | Handoff → API switch duplicates | Fixed | `publisher.ts:86` | `publish.test.ts:166` |
| 17 | No lock on `state.json` | Fixed | `state.ts:11-40`, used by publish, approve, mark, assist and launch | `publish.test.ts:147` |
| 18 | Links keep trailing punctuation | Fixed | `limits.ts:3`, shared by `bluesky.ts` and `crosspost.ts` | `adapters.test.ts:84` |
| 19 | Redaction replaces every env value | Fixed | `http.ts:5-8`; `publisher.ts` uses `ALL_ENV_VARS` | `adapters.test.ts:73` (checks `LANG`) |
| 20 | Gist rename adds a second file | Fixed | Fixed `README.md` filename, `gist.ts:5` | `adapters.test.ts:104` |
| 21 | Canonical URL and dependency on different destinations | Fixed | `usesCanonical`, `publisher.ts:25,121-122` | Partly (no test that HN is blocked when devto fails) |
| 22 | Tests miss the publish-path bugs | Fixed | – | Real `approve`, `publishCampaign` with X, undici-shaped errors, 429/refused/500, preflight, force, mark, status |
| 23 | Adapter and redaction tests too narrow | **Partly** | – | All Hashnode mutations exercised, but no schema validation, and no publish-level check that output and `state.json` are secret-free |
| 24 | Dry-run cost and payload wrong | Fixed | `publisher.ts:96-97` | `publish.test.ts:32` |
| 25 | Backoff ignores `Retry-After` | Fixed (numeric form only; the HTTP-date form falls back) | `publisher.ts:46-50` | `publish.test.ts:80` |
| 26 | DEV `Accept` header and tag rules | Fixed (but crashes the dry run, new #9) | `devto.ts:6,10` | `adapters.test.ts:58` |
| 27 | `.env` quotes and trailing spaces | Fixed | `env.ts:8-20` | `auth.test.ts:9` |
| 28 | Agent timeout and error output | Fixed (the agent's stderr is now thrown away: `draft.ts:47`) | `draft.ts:46-48`, `cli.ts:68-69` | – |
| 29 | `--open` is macOS-only | Fixed | `publisher.ts:135,139` | `publish.test.ts:128` |
| 30 | Unvalidated `--pr` and anchors | Fixed (a commit or PR body line `## [E9] x` still creates an anchor) | `brief.ts:40`, `check.ts:19` | `drafts.test.ts:79` |
| 31 | Mutable test hook in production code | Fixed (`ctx.crosspost` injection) | `crosspost.ts:10-11` | – |
| 32 | Ordering, Bluesky card | Fixed | `publisher.ts:84 before 88`, `bluesky.ts:26-27` | `adapters.test.ts:84` |

## New findings

1. **blocker — `crosspost.ts:28-32` and `:24-26`: LinkedIn and Nostr outcomes are classified `failed`, so the next run reposts.**
   - LinkedIn is the owner's chosen tier-1 API, so this breaks the "No duplicate posts" rule on a path that will actually be used.
   - `LinkedInStrategy` throws a plain `Error("<status> Failed …")`. A 502/503/504 becomes `failed` (the spec requires `unknown`), and a 429 is not retried.
   - After a successful post, `getUrlFromResponse` throws when `x-restli-id` is missing (the X strategy does the same without `data.id`). That exception lands in the same catch, so a live post is recorded `failed`.
   - Nostr: the library turns relay timeouts and close-before-OK into `Error("Failed to publish to any relays: … Request timed out")`, which is `failed`. A relay may have stored the event, and a rerun signs a new event (new `created_at`), giving a duplicate note.
   - **Fix:**
     - Parse `/^(\d{3}) /` from LinkedIn messages into an `HttpError`.
     - Wrap everything after `client.post` resolves in a try that throws an `UncertainResponseError`.
     - Map Nostr messages containing "timed out" or "closed unexpectedly" to `unknown`.
     - Test against the real strategy classes with a stubbed global `fetch` and `WebSocket`, not a fake carrying `code: 429` (`adapters.test.ts:100`).

2. **concern — `draft.ts:42-46` and `keychain.ts:23`: the agent isolation is only a working directory, and Keychain items are readable by any process running as the same user.** [INFERENCE: from `security(1)` default ACL behaviour; I did not test it against the real Keychain.]
   - Items created by `/usr/bin/security add-generic-password` without `-T` trust `security` itself. So a prompt-injected agent with `PATH` and `HOME` can run `security find-generic-password -s market-blaster -a DEV_API_KEY -w` without any prompt.
   - Approval is still an unkeyed SHA-256 in a writable `state.json` (`state.ts:78-83`). The agent can compute and write `approvedHash` for the project it finds under `HOME`, then run `mblast publish --yes`.
   - So round-1 #5's actual threat is still open.
   - **Fix:** run `agent.command` under `sandbox-exec`, with a profile that denies `process-exec` of `/usr/bin/security` and file reads and writes outside the workspace, the agent's own config dirs and the system paths. Alternatively, state the limit in `docs/design/auth-and-reach.md` and the guide. Either way, the approval key needs a secret the agent cannot read.

3. **concern — `keychain.ts:23`: the secret is passed in argv (`-w value`).** Any local process can read it from `ps` while `security` runs.
   - **Fix:** `execFileSync("security", ["-i"], { input: \`add-generic-password -U -s market-blaster -a ${key} -w ${quoted}\n\` })`, or pass `-w` as the last argument with no value so `security` reads the password from the TTY.

4. **concern — the tests use the developer's real Keychain.**
   - `loadEnvWithSources` defaults to `keychainGet` on darwin (`env.ts:28`). `doctor` (`setup.test.ts:108`, `auth.test.ts:61`), `loadEnv` (`setup.test.ts:45`) and `main(["publish", …])` (`assist.test.ts`) run without injecting it. Those tests take about 220–250 ms each, which fits spawning `security` around 20 times.
   - `setup.test.ts:121` asserts that bluesky is `missing`. It will fail on the owner's machine right after the design's setup step `mblast auth set BLUESKY_*`.
   - **Fix:** add `keychain?: (key) => string | undefined` to `IO`. `realIO` supplies the real lookup, `fakeIO` defaults to `() => undefined`, and `doctor`, `publish` and `auth` read it from `io`.

5. **concern — `publisher.ts:104-107`: the spec's preflight read is skipped for X and Nostr.** The spec says "for API destinations, perform one authenticated read". The code prints "no read check available" and continues.
   - **Fix:** either add `x.verify` (`v2.me()`; note that X bills reads under pay-per-use) and an offline Nostr check (construct `NostrStrategy` to validate the key), or amend `publishing/spec.md` to exempt destinations that have no free read.

6. **concern — `handoffs.ts:10`: Reddit, an `outline` destination, prefills the AI-written draft title.** The spec says outline means "nothing is prefilled or copied". In `--assist`, that title is not even approved (#7).
   - **Fix:** drop `&title=…`, or use the canonical article's title the way HN does.

7. **concern — `assist.ts:37` vs `publisher.ts:82`: approval rules differ.**
   - `--assist` requires approval only for `ai: draft`. Plain `publish` requires it for everything except HN.
   - So unapproved Reddit, Lemmy, Product Hunt and newsletter titles and outlines are opened and recorded `handoff` in assist, but refused in publish.
   - **Fix:** one shared predicate `needsApproval(id) = META[id].ai !== "none"`, used in both places.

8. **concern — `check.ts:29,35`: outline bodies skip grounding as well as length.**
   - The spec says to warn for "each number … found in a draft". Invented numbers in Reddit or newsletter talking points pass silently into what the human then writes.
   - `drafts.test.ts:95` enforces the wrong behaviour.
   - **Fix:** skip only the length measure for outline drafts; keep grounding.

9. **concern — `devto.ts:6` and `publisher.ts:97`: an invalid DEV tag crashes the dry run with a stack trace.**
   - `payload()` throws a plain `Error`. In the dry-run path nothing catches it, and `cli.ts:114` rethrows anything that isn't a `UserError`. `check` and `approve` both accept the tag, and the skill never states DEV's tag rule.
   - **Fix:** validate tags in `check.ts` as an error, and add "lowercase alphanumeric, at most 4" to `reference/destinations.md`'s `## devto` entry.

10. **concern — `github-discussion.ts:16,29-37`: GraphQL errors always become `failed`, and repo/category are not checked in preflight.**
    - GitHub can return `errors` (timeouts, `RATE_LIMITED`) alongside a mutation that already ran, so a rerun creates a duplicate discussion.
    - `verify` only queries `viewer`. A wrong `repo` or `category` is found only after devto has gone live.
    - **Fix:**
      - If `data.createDiscussion` is non-null, return it despite `errors`.
      - Map errors of type `RATE_LIMITED` or containing "timeout" to `UncertainResponseError`.
      - Run `LOOKUP` inside `verify`.
      - Require `githubDiscussion.repo` and `category` in `validateConfig` when the destination is enabled.

11. **concern — `auth.ts:116-119`: a renewed LinkedIn token can be silently ignored.**
    - Shell and `.env` values beat the Keychain (`env.ts:34-44`). If `LINKEDIN_ACCESS_TOKEN` or `LINKEDIN_TOKEN_ISSUED` is in `.env`, `publish` keeps using the old token after `auth linkedin` succeeds.
    - **Fix:** after saving, look at `sources` and warn "LINKEDIN_ACCESS_TOKEN is overridden by <source>; remove it there".

12. **concern — `SKILL.md:15-16,59`: the skill contradicts `meta.ts` for Lemmy and the newsletter.**
    - The skill lists only Reddit and Product Hunt as outline; "Other destinations: write a first draft" covers `lemmy` and `newsletter`, which are `ai: outline` in `meta.ts:62-63`.
    - `brand.yml` (`draft.ts:31-38`) also leaves out the `githubDiscussion`, `lemmy`, `newsletter` and `nostr` settings, so the agent cannot tailor posts to the community or newsletter targets.
    - **Fix:** generate the per-destination policy list into the prompt or `brand.yml` from `META`, add the missing config blocks, and fix the checklist line.

13. **concern — `crosspost.ts:26`: Nostr records `nostr:note1…` as the post URL.** The real `NostrStrategy.getUrlFromResponse` returns a truthy `nostr:` URI, so the `njump.me` fallback never runs. `{{url:nostr}}` and `status` then show a non-https link. The test fake (`destinations.test.ts:32`) leaves out `getUrlFromResponse`, which hides this.
    - **Fix:** for Nostr, always build `https://njump.me/${noteId}`.

14. **nit — `http.ts:14`: the Hashnode "paid offering" hint never fires.**
    - With `redirect: "error"`, real fetch rejects. I confirmed it locally: `TypeError: fetch failed`, cause `unexpected redirect`. Users see "hashnode: preflight failed: fetch failed".
    - `adapters.test.ts:74-79` passes only because its fake returns a 301 response.
    - **Fix:** use `redirect: "manual"` and treat `3xx` as an `HttpError`, or catch `cause.message === "unexpected redirect"`.

15. **nit — `auth.ts:61`: `auth set FOO` does not list the known keys,** which the spec scenario requires.
    - **Fix:** `` `Unknown credential key; known: ${AUTH_ENV_VARS.join(", ")}` ``.

16. **nit — `auth.ts:96-101`: the authorization URL is never printed,** so there is no fallback over SSH, on Windows, or when `open` fails.
    - **Fix:** `io.out(url)` before trying the opener, and don't reject when the opener fails.

17. **nit — `state.ts:79`: `"github-discussion" in config` is false (the config key is `githubDiscussion`),** so changing `repo` or `category` after approval does not invalidate it.
    - **Fix:** map destination id to config key explicitly.

18. **nit — `handoffs.ts:29` and `publisher.ts:132-144`: non-assist `publish` hands off only the first newsletter target.** `--open` opens only `console.dev`, and the other targets are never printed.
    - Also, `assist.ts:62` opens `cooperpress.com/submit/` twice when both Cooperpress targets are set.
    - **Fix:** print every target in `publish`, and deduplicate URLs.

19. **nit — `crosspost.ts:54-57` with `assist.ts:51`: a LinkedIn handoff whose body has no link has no URL,** so `--assist` fails it with exit 1.
    - **Fix:** fall back to `https://www.linkedin.com/feed/?shareActive=true` with `prefills: "none"`.

20. **nit — the lock error is matched by message string in 6 places** (`publisher.ts:56`, `assist.ts:88`, `approve.ts:34`, `mark.ts:35`, `launch.ts:43`). An empty lockfile left by a crash between `openSync` and `writeFileSync` is never treated as stale (`state.ts:22`).
    - **Fix:** a `LockError extends UserError` class, caught in `cli.ts`; treat an empty or unparsable pid as stale.

21. **nit — dead code and loose validation:**
    - `keychainList` (`keychain.ts:29`) is unused.
    - `lemmy.instance` is not validated as a bare hostname (`config.ts:92`); `https://programming.dev` produces `https://https://…`.
    - With `newsletter` enabled and no `targets`, the error appears only at handoff.

22. **nit — spec drift:**
    - The `publishing/spec.md` delta covering assist, launch and uncertain outcomes is uncommitted in the working tree.
    - No spec mentions `nostr` or `github-discussion` in the publish order (`publishing/spec.md:41`).
    - The design's build item 5 (Discord webhook) is not implemented and not deferred anywhere.
    - The design says LinkedIn uses the API, but `init.ts:55` defaults to `api: false`.

## The two design rules

- **No browser automation:** holds. A grep for playwright, puppeteer, osascript and chrome under `src/`, `skills/` and `bin/` finds nothing. Handoffs only `open`/`xdg-open` a URL.
- **HN never gets generated text:** holds.
  - `check.ts:14` drops `drafts/hn.md`, and `draft.ts:22` never asks for it.
  - Both `--open` (`publisher.ts:134`) and `--assist` (`assist.ts:53-54`) skip the clipboard for HN.
  - HN prefills only the canonical URL and the canonical article's title.
  - Edge cases: HN takes the home draft's *current* title even if it was edited after publishing, and with a URL `canonicalHome` the title is empty (`publisher.ts:71-72`).

I edited no files.
