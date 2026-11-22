# Code review 1 (anthropic/claude-opus-5-5 via slipway run review)

I found 5 blockers, 17 concerns and 9 nits. `npm test` passes 32/32 and `tsc --noEmit` is clean, but the suite misses most of the problems below. Blockers 1–4 and items 6, 18 and 19 are confirmed with a throwaway script that called `publishCampaign` with the real `ADAPTERS` and a mocked `fetch`; I deleted it afterwards. The Hashnode finding comes from live `curl` and Node `fetch` calls. Everything else comes from reading the code.

### Blockers

1. **blocker: X API mode can never publish.** `src/publisher.ts:72-75` makes preflight fail for any API destination that has no `verify`. The `x` adapter in `src/destinations/crosspost.ts:24-32` has none. With `x.api: true` and credentials set, the repro printed `x: preflight failed: adapter has no credential verification`, exited 1 and sent no writes for any destination. `doctor --online` (`doctor.ts:24`) skips the check silently.
   - **Fix:** add `x.verify` that calls `new TwitterApi({...}).v2.me()` (twitter-api-v2 is already installed under Crosspost; make it a direct dependency).
   - **Test:** add one that runs `publishCampaign` with `x.api: true`.

2. **blocker: DEV records unpublished articles as `published` and can unpublish live ones.** `src/destinations/devto.ts:4` sends `published: !stage && devto.publish === true`. The `init` default is `publish: false` (`init.ts:34`).
   - **Create:** the repro sent `published=false`, but state recorded `published`. Social posts then link to an unpublished draft URL, and Hashnode's `originalArticleURL` points at it.
   - **Update:** every update or `--stage` run sends `PUT published:false`, which unpublishes an article that is live.
   - The spec says the second run "updates the same id with `published: true`".
   - **Fix:** record `staged` whenever the create sends `published:false`. Never send `published:false` to an id whose state is `published`. On update, send `published:true` unless staging.

3. **blocker: `mark --not-posted` after an update timeout creates a duplicate article.** `src/commands/mark.ts:18` clears `id`, `url` and `contentHash`. Repro: devto was published with id 7, the re-approved update timed out (`unknown`), then `mark --not-posted` ran. The next run sent `PUT /api/articles/7` followed by `POST /api/articles`, creating a second article.
   - **Fix:** store the previous `{status, id, url, contentHash}` when writing `pending` (`publisher.ts:105`) and restore it on `--not-posted`.

4. **blocker: dropped-connection errors are classified `failed`, so the next run reposts.** `src/publisher.ts:34-37,127` only treats `TimeoutError`, `AbortError`, `ECONNRESET`, `EPIPE` and `UND_ERR_SOCKET` as uncertain. The repro classified `UND_ERR_HEADERS_TIMEOUT`, `UND_ERR_BODY_TIMEOUT` and `ETIMEDOUT` as `failed`. A `SyntaxError` from parsing a 2xx body (`bluesky.ts:17`, `devto.ts:9`, `hashnode.ts:18`) also becomes `failed`, even though the post exists.
   - **Fix:** invert the default. Use `failed` only for an `HttpError` or a pre-connect error (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `UND_ERR_CONNECT_TIMEOUT`); everything else becomes `unknown`.

5. **blocker: the drafting agent can bypass approval and reach credentials.**
   - The agent runs with `cwd` set to the project root (`draft.ts:31`), and `loadEnv` reads `<root>/.env` (`env.ts:21-23`).
   - Approval is an unkeyed SHA-256 in a writable `state.json` (`state.ts:39-43`).
   - The approval gate only checks `isTTY` (`approve.ts:12`), and harnesses can allocate a PTY.
   - The brief contains attacker-controlled commit and PR text. A prompt injection can make the agent `cat .env`, write `approvedHash` into `state.json`, or run `mblast publish --yes`, which loads `.env` by itself.
   - The env allowlist meets the letter of the spec, but neither safety property holds.
   - **Fix:** run the agent in an `mkdtemp` workspace that contains only `brief.md` and `drafts/`. Copy back only the target `drafts/<id>.md` files that pass `parseDraft`, and refuse if any other file changed. This needs `design.md:78` changed. Also drop `SHELL` from the allowlist (`draft.ts:29`); the design does not list it.

### Concerns

6. **concern: gateway errors are classified `failed`.** A 502, 503, 504 or 524 from a proxy usually means the origin may still have processed the request. The repro recorded a Bluesky 504 on `createRecord` as `failed`, so the next run creates the post again. The spec text causes this ("failed on an HTTP error").
   - **Fix:** for non-idempotent creates (DEV, Gist, Bluesky, X, LinkedIn), treat 408, 502, 503, 504 and 524 as `unknown`, and amend the spec. Mastodon is already covered by its `Idempotency-Key`.

7. **concern: X and LinkedIn have no working timeout or error mapping.** `crosspost.ts:16-22` passes a `signal`, but Crosspost's `TwitterStrategy.post` only calls `throwIfAborted()` before `client.v2.tweet(message)`. The tweet request itself cannot be aborted, so it can hang forever.
   - twitter-api-v2 errors are `ApiResponseError` (HTTP status in `.code`) or `ApiRequestError` (`.requestError`, no `.cause`). So a 429 is never retried, and a dropped connection becomes `failed`, which means a duplicate paid post on the next run.
   - LinkedIn's `fetchPersonUrn` ignores the signal and throws a plain `Error("429 …")`.
   - **Fix:** wrap `post()` in a timeout race that rejects with `TimeoutError`, map the response errors to `HttpError`, and map `ApiRequestError` to `unknown`.

8. **concern: Hashnode now redirects, and fetch follows redirects with credentials.**
   - **Observed:** `POST https://gql.hashnode.com` returns `301` to `hashnode.com/announcements/graphql-api` (changelog 2026-05-13: "GraphQL API is moving to a paid offering"), with or without a token. Node `fetch` follows it to an HTML 200, so `JSON.parse` throws "Unexpected token '<'" and preflight reports a parse error instead of the real cause.
   - I couldn't check whether a Pro token gets past the redirect.
   - Separately, undici strips only `Authorization` and `Cookie` on a cross-origin redirect. DEV's custom `api-key` header would be forwarded to the redirect target.
   - **Fix:** set `redirect: "error"` (or `"manual"` and map 3xx to `HttpError`) on every adapter fetch, and check `content-type` before parsing.

9. **concern: Mastodon's instance limit is unknown when `check` runs.** `check.ts:32` and `limits.ts:43-48` use `maxChars ?? 500`. `publisher.ts:42-44` aborts on check errors before `mastodon.verify` (`mastodon.ts:27`) learns the real limit. On a large-limit instance, a 600-character post can never publish.
   - Separately, `/api/v2/instance` returns 404 before Mastodon 4.0, so preflight fails on older instances.
   - **Fix:** treat the length as a warning until the instance limit is known, or cache it in state; fall back to `/api/v1/instance`. Mastodon counts graphemes, not code points.

10. **concern: the skill contradicts `check`.** `SKILL.md:10` says to skip gist and hn drafts when the brief has no runnable example. `check.ts:22` makes a missing draft an error, and `draft.ts:33-39` exits 1. As a result `new` stops before `check` (`new.ts:17-18`), although the spec says the exit code is check's, and publish refuses everything (`publisher.ts:44`).
    - **Fix:** support a `skip: <reason>` frontmatter draft that `check` reports and `publish` skips.

11. **concern: the grounding check is narrower than the spec.** `check.ts:37` only catches numbers with units. The spec (`content-drafts/spec.md:59`) says "each number". Phrases like "used by 10,000 developers" or "40 contributors" pass silently.
    - **Fix:** match bare numbers too, excluding URLs and `E\d+` anchors.

12. **concern: the approval hash leaves out tags and settings that come from config.** `state.ts:39-43` hashes destination, title, canonical and body only. But `devto.ts:4` sends `post.tags`, and the canonical URL and `devto.publish` come from config (`publisher.ts:27`). Any of these can change after approval and still publish.
    - **Fix:** hash `tags` and show tags and canonical in `approve` (`approve.ts:25`). This needs `design.md:70` changed.

13. **concern: `publish --stage --yes` posts socials for real.** `publisher.ts:104` stages only devto and hashnode; Gist, Mastodon, X and the rest are created live in the same run.
    - **Fix:** with `--stage`, restrict the eligible list to devto and hashnode and print the others as skipped.

14. **concern: a failed update demotes a live article.** `publisher.ts:105,129` overwrites the status with `pending` and then `failed`. `publishedUrls` (`publisher.ts:18-22`) only reads `published`, so dependents get `blocked` and lose their canonical URL while the article is still live.
    - **Fix:** keep the last live `{id, url, hash}` separately from the attempt status.

15. **concern: `mark --url` keeps a stale hash.** `mark.ts:24` prefers the old `contentHash` over `approvedHash`. After a re-approved social post times out and is marked, the next run says "requires --force", and the user's `--force` creates a duplicate.
    - **Fix:** use `approvedHash ?? contentHash`.

16. **concern: switching from handoff to API mode duplicates manual posts.** A `handoff` entry stays eligible (`publisher.ts:56-57,99`). If the user posted manually from the intent link and later sets `x.api: true` or `linkedin.api: true`, the next run posts again through the API.
    - **Fix:** treat `handoff` with the same hash as done unless `--force` or `mark` is used.

17. **concern: no lock on `state.json`.** `state.ts:10-35`: two `publish --yes` runs (two terminals, or CI and local) both read the state before `pending` is written, and both create.
    - **Fix:** take an `O_EXCL` lockfile for `publish`, `approve` and `mark`, and re-read state under the lock.

18. **concern: link detection includes trailing punctuation.** The regexes in `bluesky.ts:26`, `limits.ts:3`, `handoffs.ts:6` and `crosspost.ts:41` keep a trailing `.`, `,` or `)`. The repro produced the facet URI `https://dev.to/a/b.`, which is a broken link.
    - **Fix:** one shared URL regex that trims trailing punctuation.

19. **concern: adapter redaction replaces every env value.** `bluesky.ts:14`, `mastodon.ts:13`, `hashnode.ts:16` and `crosspost.ts:48` redact all values in the process env (`SHLVL=1`, `TERM`, `LANG`, …). The repro output was `mastodon 422: … Text *** is too long`. Meanwhile `devto.ts:8` and `gist.ts:8` don't redact at all.
    - **Fix:** call `redact(text, env, ALL_ENV_VARS)` in all adapters.

20. **concern: renaming a Gist adds a second file.** The filename comes from the title (`gist.ts:3-5`). When the title changes, the `PATCH` at `gist.ts:16` adds a new file and leaves the old one.
    - **Fix:** store the filename in state and send `{ [old]: { filename: new, content } }`.

21. **concern: the canonical URL and its dependency are applied to different destinations.**
    - `publisher.ts:27` sets the canonical URL on every destination, but `publisher.ts:90` only adds the canonical-home dependency for articles.
    - So when devto has failed, HN records `handoff` with `submitlink?u=&t=…` instead of `blocked`.
    - Gist has no canonical field but is still blocked when devto fails.
    - **Fix:** add a per-adapter `usesCanonical` flag (devto, hashnode, hn, reddit).

22. **concern: the tests would not catch the publish-path bugs above.**
    - The `setup()` helper in `publish.test.ts:22` computes `approvedHash` itself, so `approve.ts:23-26` never runs with a TTY.
    - The config at `publish.test.ts:21` forces `devto.publish: true`, which hides blocker 2.
    - `adapters.test.ts:45-52` calls `x.create` directly instead of going through `publishCampaign`, which hides blocker 1.
    - The timeout test (`publish.test.ts:63-69`) only throws a `DOMException` on create. It has no undici-shaped `TypeError('fetch failed', {cause})` and no update-path timeout followed by `mark` (blockers 3 and 4).
    - There are no tests for:
      - retry on 429 or `ECONNREFUSED`, or no retry on 500 (the `sleep` option at `publisher.ts:15` is never used);
      - the preflight bad-credential scenario (`publishing/spec.md:36-38`);
      - `--force` or refusal of a changed social post;
      - `mark --url`;
      - `status` (task 4.6).
    - **Fix:** add these cases, driving the real adapters through `publishCampaign` with `mockFetch`.

23. **concern: the adapter and redaction tests are too narrow.**
    - Hashnode tests cover only `publishPost`. `createDraft`, `updateDraft`, `publishDraft` and `updatePost` are untested, and no query is checked against the schema, so a wrong input field name passes against canned responses.
      - **Fix:** check in the schema SDL and run `graphql.validate` against it.
    - The redaction test (`publish.test.ts:60`) checks `state.json` but not `io.text()`, and its env has no ordinary variables, so item 19 is missed.

### Nits

24. **nit: dry run prints the wrong cost and payload.** `publisher.ts:65` prints X's cost even in handoff mode, and the dry-run payload ignores `--stage`.
    - **Fix:** print cost only when the mode is `api`, and pass `stage` through.
25. **nit: retry backoff ignores `Retry-After`.** `publisher.ts:120` waits 100 ms and 200 ms, then gives up.
26. **nit: DEV request details.** `devto.ts:7` sends no `Accept: application/vnd.forem.api-v1+json`, and tags aren't validated against DEV's rules before the silent truncation to 4.
27. **nit: `.env` parsing keeps quotes and trailing spaces.** In `env.ts:9-14`, `KEY="v" # c` keeps the quotes, and unquoted values keep trailing whitespace. Both produce bad tokens.
28. **nit: agent runs have no timeout and fail badly.** `draft.ts:31` sets no timeout. On failure, `cli.ts:58` puts the whole prompt in the message (`args.join(" ")`), and because it isn't a `UserError` the CLI prints a stack trace.
29. **nit: `--open` is macOS-only.** `publisher.ts:98` calls `pbcopy` and `open`, so on Linux the handoff is recorded `failed`.
30. **nit: unvalidated inputs.**
    - `brief.ts:85` passes `--pr` to `gh` without validation; check it against `^\d+$`.
    - `check.ts:18` accepts any `[E\d+]` found anywhere in the brief, including commit bodies and diff hunks, as a valid anchor.
31. **nit: test hook in production code.** `crosspost.ts:10-14` exports a mutable `strategyFactory`, and `adapters.test.ts:47` never resets it.
32. **nit: small ordering and content issues.**
    - `publisher.ts:55` checks for missing credentials before the published-skip, so removing a token after everything is published makes the run exit 1.
    - The Bluesky link card (`bluesky.ts:33`) uses the first body line as its title, an empty description, and a hardcoded `langs: ["en"]`.
