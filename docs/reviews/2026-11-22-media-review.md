# Code review: media-and-import + campaign zip (anthropic/claude-opus-5-5 via slipway run review)

1. **blocker**: `src/destinations/crosspost.ts:61` (X) and `:101` (Nostr), plus any other adapter that can publish in API mode without reading `post.media`. In API mode these drop the attachments without a word. `approve` shows `media:` lines and the hash covers the bytes, yet the published post has no media. `check.ts` has no rule for these destinations. **Fix:** in `check.ts`, add an error for media on any API-mode destination with no media support. Or route those drafts to handoff, the way `destinationMode` does for LinkedIn PDFs (`publisher.ts:135`).

2. **concern**: `src/destinations/bluesky.ts:96`. Uploading a video a second time returns an HTTP error with `already_exists`, but the body still carries `jobId` and/or `blob`. This is reported behaviour, not in the official docs: https://zenn.dev/dev_ctun/articles/bluesky-video-upload-pitfalls. `requestJson` throws on that status, which becomes `MediaUploadError` and `failed`. So after any failure that happens after the video upload, the publisher's 429 retry and every later `publish` run fail for good, unless the video bytes change, and that voids approval. **Fix:** call `fetch` directly for `uploadVideo`, read the JSON body first, and carry on if it has `blob` or `jobId`.

3. **concern**: `src/destinations/bluesky.ts:66` against `:118` and `:125`. `imageSize` decoding and `ffprobe` only run inside `create`. A missing `ffprobe` or an undecodable image fails after earlier destinations in the publish order have already posted. The spec says media is validated "before any upload or post write". **Fix:** move the dimension probes into `preflight` and pass the dimensions through, or cache them. A Bluesky video upload-limits check could also go here.

4. **concern**: `src/destinations/mastodon.ts:55`. Polling stops after 10 tries 1 s apart, so about 10 s. Mastodon video transcoding often takes longer, and the spec says "polls until the media is ready". Bluesky allows 10 minutes (`bluesky.ts:99`). **Fix:** poll against a deadline of several minutes with backoff, and make the delay injectable so tests don't sleep.

5. **concern**: `src/destinations/http.ts` (`AbortSignal.timeout(ctx.timeoutMs)`) with `timeoutMs: 30_000` in `publisher.ts`. Every upload request gets 30 s, and that includes the full body:
   - A 300 MB Bluesky video needs about 80 Mbit/s to finish in time.
   - At `crosspost.ts:28` one 30 s limit covers up to 20 LinkedIn image uploads plus the post. A slow run gets recorded as an `unknown` outcome that the user has to `mark` by hand.

   **Fix:** set a per-call timeout for uploads, scaled to the byte count.

6. **concern**: `src/manifest.ts` (v2 media kinds `image|video|gif|document`) against `src/check.ts:36`, `:44` and `:48`. Studio exports `gif` according to the design doc. Bluesky, Mastodon and LinkedIn API all reject it, so every imported campaign with a GIF fails `check`. **Fix:** treat `gif` as `image` in the checks and adapters, or map it during import.

7. **concern**: `src/destinations/devto.ts:19`. `main_image` is only sent when a media item has `cover: true`. The spec says "WHEN `devto.coverUrl` is configured THEN the DEV article uses that hosted URL as its cover". Also, `coverUrl` is project-wide config, so every campaign gets the same cover. **Fix:** either always send it when it is configured, or change the spec. Consider a per-draft `coverUrl`.

8. **concern**: `src/commands/approve.ts:44-49`. Previews only open when the user types `p`. The spec says "the user sees each path and alt text and its preview is opened". The test (`publish.test.ts`, "previews only on request") locks in this deviation. Captions are never previewed. **Fix:** open the previews before the prompt, or change the spec.

9. **concern**: `src/check.ts:41`. The Mastodon warning fires for every draft with media and cannot be resolved, so `mblast check --strict` (`commands/check.ts:23`) exits 1 for any campaign that has Mastodon media. **Fix:** drop the warning, or only emit it when the configured defaults are actually being relied on.

10. **concern**: `src/campaign-zip.ts:12`. `readFileSync` loads the whole archive and nothing caps its size first. Entry limits only apply after it is in memory. **Fix:** `statSync` the file and reject anything over `maxTotal` plus a central-directory allowance before reading it.

11. **concern, tests**: `test/bluesky-media.test.ts:12-25` and `:58`.
    - The `uploadVideo` mock returns a finished blob straight away, so the polling loop, the `{jobStatus}` unwrapping in `getJobStatus` and the 409 path never run.
    - The `createSession` mock has no `didDoc`, so `aud === did:web:bsky.social` tests the fallback, not the real address from `didDoc` (`*.host.bsky.network`).
    - Captions come in as a separate `vtt` item, so the `captions:` field that `resolved()` expands for imported drafts (`publisher.ts:46`) is never covered.

12. **concern, tests**: `test/mastodon-media.test.ts:50` treats processing failure as `{error: "..."}` in a 200 response. As far as I know, Mastodon reports that as a 422 from `GET /api/v1/media/:id`, which is not covered (inferred, not checked against Mastodon docs). The test at `:72` checks for exactly 11 calls, which locks in the 10 s cap from item 4.

13. **concern, tests**: `test/campaign-zip.test.ts:75`. The limit tests run honest archives with low option values. The checks that stop lying archives have no tests: actual size against claimed size, mismatched local headers, duplicate names. My probe shows the size check works, but a regression would go unnoticed. **Fix:** add a test that patches the central-directory size, like my probe did.

14. **concern, tests**: no publish-level test shows that a preflight failure for a later destination (Mastodon instance limits, Gist binary) stops an earlier one in the order from posting. No test covers item 1 either.

15. **nit**: `src/campaign-zip.ts:37` and `:57`. On macOS, names that differ only by case or Unicode normalisation, and a file plus a directory with the same name, are refused with raw `EEXIST` rather than `UserError`. It fails safe, but the message is poor. CRC32 is never checked either. **Fix:** compare names case-folded and NFC-normalised, and check CRC as the data is written.

16. **nit**: `src/commands/import.ts:22`. A path that doesn't exist throws a raw `ENOENT`. Any file that isn't a directory is treated as a zip. The CLI summary (`cli.ts`) still says `import <dir>`.

17. **nit**: `src/commands/import.ts:50`, `:129` and `:132`. Drafts that aren't approved, plus `brief.md`, `handoff/` and `review/`, are overwritten silently. That follows the spec, but hand edits are lost without a warning. **Fix:** list the files about to be replaced.

18. **nit**: `src/check.ts:67-69` against `src/destinations/gist.ts:12`. Two rule sets disagree. `check` allows `.md` or `.json` of any kind. The adapter requires `.svg` or `kind: text`. A draft can pass `check` and then fail preflight. **Fix:** share one predicate.

19. **nit**: `src/publisher.ts:46` with `:86`. In Bluesky handoff mode the captions file is listed twice, once as `captions` and again as the expanded `vtt` item.

20. **nit**: `src/destinations/bluesky.ts:92`. `replaceAll(":", "%3A")` gets encoded again by `URLSearchParams` (to `%253A`) for hosts with a port.

21. **nit**: `src/state.ts:123-124`. Each `approvalHash` reads every attachment in full with `readFileSync`, and the publisher calls it several times per destination, through `resolved()` among others. That means several full reads of a 300 MB video. The bytes uploaded are also read separately from the bytes hashed, a small TOCTOU window. **Fix:** stream the hash once per run and upload the buffer that was hashed.

22. **nit**: `src/types.ts:73-74`. `/** Path of the draft file. */` now sits above `media`, not `path`.

23. **nit (judgement call: duplicated code)**:
    - `src/commands/import.ts`: the v1 and v2 importers each repeat the lock, approval refusal, skip writing and check reporting.
    - The media validators are written three times (`drafts.ts:22-33` and twice in `manifest.ts`), each with the same lang regex and `.vtt` rule.
    - The PDF test appears in `check.ts`, `publisher.ts:135` and `crosspost.ts`.

    **Fix:** one `validateMedia` and one `isPdf`, plus a shared `writeImport(campaign, drafts, force)`.
