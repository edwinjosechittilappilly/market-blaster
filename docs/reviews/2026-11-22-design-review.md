# Design review 1 (anthropic/claude-opus-5-5 via slipway run review)

I found 4 blockers, 13 concerns and 7 nits. The design follows the research's main direction: build the evidence-to-drafts skill, reuse Crosspost, and use handoffs for gated platforms. Where it falls short is publishing safety and recovery. As written, three normal paths can produce duplicate posts or bypass human approval.

Line references are `design Lnn` = `docs/design/market-blaster.md`, `apis Lnn` = `docs/research/platform-apis.md`, `tools Lnn` = `docs/research/existing-skills-and-tools.md`. Some claims rely on Crosspost's source (`main`, `src/strategies/*.js`), which I read because the design depends on it and the research doesn't cover those details. Those items say "Crosspost source".

1. **blocker: `--yes` doesn't guarantee a human approved the post.** Goal 3 (design L26) depends on `--yes`. But `mblast draft` runs `omp -p` with shell access (L67), so the agent can run `mblast publish --yes` itself. The research asks for "actual human approval in our flow" (tools L44, L91; apis L13).
   **Fix:** add `mblast approve <slug>`. It requires a TTY and writes each draft's content hash into `state.json`. `publish` then refuses any draft whose hash isn't approved. The skill and the `draft` invocation must not allow `publish`.

2. **blocker: an unclear network result leads to a duplicate post on the next run.** A timeout is recorded as `failed` (L102), but reruns only skip entries marked `published` (L101). So a plain rerun posts again without `--force`. That breaks Goal 3, and the research warns against claiming exactly-once delivery (tools L79). Crosspost's Mastodon strategy also doesn't send the `Idempotency-Key` header the research recommends (apis L79) (Crosspost source).
   **Fix:** before each write, save a `pending` entry atomically (temp file + rename). After a timeout or crash, set the status to `unknown`, not `failed`. `publish` refuses `unknown` entries until `mblast mark <slug> <dest> --url … | --not-posted` resolves them. Call Mastodon directly with `Idempotency-Key = contentHash`. Retry creates only on 429 or connection-refused, never on a timeout.

3. **blocker: placeholders only resolve within the same run, so recovery breaks.** `{{url:devto}}` resolves only to URLs "published earlier in the same run" (L57). After a partial failure, DEV is skipped as `published`, its URL is never resolved, and every social draft fails. That is the recovery path the risk table relies on (L101).
   **Fix:** resolve placeholders from `state.json`. If the referenced destination isn't `published`, mark the dependent draft `blocked` and give the reason; never post it with the placeholder unresolved or fall back to a handoff.

4. **blocker: the publish order doesn't account for one destination failing while others depend on it.** If DEV fails, nothing says what happens to drafts that reference it. If a social draft passes `check` but is over the limit once the real URL is inserted, it fails after DEV has already gone live. Crosspost's Mastodon length counts URLs at their full length (Crosspost source), so a long DEV slug can push a post over the limit.
   **Fix:** `check` substitutes a worst-case URL length for each placeholder. `publish` resolves placeholders and re-checks every social draft before the first long-form write, and stops early if any would fail.

5. **concern: there's no update path, so fixing a published article creates a duplicate.** The research says "update rather than blindly re-create" (tools L80) and points to stored remote IDs (tools L56, L58). The design's only option is `--force`, which re-creates. A typo fix on DEV therefore produces a second article.
   **Fix:** if a long-form destination is `published` and its hash changed, update it using the stored `id` (DEV and Gist support updates; Hashnode has a post-update mutation, `[INFERENCE]`, not cited in the research). Social posts are immutable: refuse with a clear message. Keep `--force` for "post again" only.

6. **concern: LinkedIn and X contradict the research's v1 decision without saying so.** The research puts both in "V1 assisted" (apis L8). The diagram routes them through Crosspost as automatic posts (design L41). The deviation isn't recorded in Alternatives or Risks. LinkedIn also needs a three-legged OAuth flow, and its tokens expire after about 60 days with refresh not guaranteed (apis L89). The design has no command to obtain or refresh that token.
   **Fix:** make the share/intent handoff the default for both. Make automatic posting an opt-in with a documented token procedure (or `mblast auth linkedin` using a loopback redirect), and add a Risks row explaining the deviation.

7. **concern: the cost line is wrong.** "Free except X and Hashnode" (L113) leaves out LinkedIn API cost, which the research marks `[UNVERIFIED]` (apis L25). The skill's one-link rule (L80) means every X post contains a URL, so the real price is $0.20 per post, not $0.015. LLM drafting cost isn't counted.
   **Fix:** state $0.20 per X announcement, mark LinkedIn cost as unverified, and add agent cost. Have the dry run print the expected charge for each destination.

8. **concern: "canonical" is used for two different things.** In the diagram (L41) and frontmatter (L56), "canonical URL" means "the URL published earlier". The research separates SEO canonicals (only DEV `canonical_url` and Hashnode `originalArticleURL`) from ordinary links; Gist and social posts have none (apis L10, L24). The design also never says which site owns the article when both DEV and Hashnode publish it, so search engines see duplicate content.
   **Fix:** add a `canonicalHome` setting to `market-blaster.yml` (own blog, or `devto`). Publish the home first, then set the other platform's canonical field to it. Rename the placeholder concept to `link`.

9. **concern: two incumbents are dismissed on the wrong grounds, and the evaluation the research asked for wasn't done.** The design says content-distribution-mcp "starts from an article" (L92). The research says "Agent writes channel variants" and calls it a distribution layer with per-channel idempotency (tools L38). The research also asked to test Pipepost's canonical wiring "before rebuilding" (tools L39) and to "validate differentiation" (tools L7). The design is marked `accepted` (L3) with neither done.
   **Fix:** reword the rejection to address transport only (MCP-only, plaintext secret storage per tools L38). Record a short spike result for Pipepost canonical wiring and for content-distribution-mcp as a possible publishing backend.

10. **concern: the scheduler alternative misstates the facts.** "Paid per channel" (L93) is wrong for Buffer: its free tier has 3 channels and 1,000 API requests per channel per month (tools L68). Postiz can be self-hosted for free (tools L12, L53) but isn't in the table. The research says to "integrate optionally" (tools L89).
   **Fix:** correct the Buffer row, add a Postiz row, and say whether the `Destination` interface can target a scheduler later.

11. **concern: missing alternative: native adapters instead of Crosspost for Bluesky and Mastodon.** Crosspost's coverage is thinner than L76 implies (Crosspost source):
    - Mastodon's limit is hard-coded at 500, but the research says each instance sets its own (apis L79).
    - There's no Mastodon `Idempotency-Key`.
    - There's no Bluesky link card (`app.bsky.embed.external`, apis L66), so posts show a bare link.
    - X length counts code points, not weighted characters.

    Mastodon is one POST. The Python row (L94) argues against a strawman. Two real options are missing: native Bluesky and Mastodon adapters with Crosspost kept for X and LinkedIn, or just the Crosspost CLI (`--file`) plus the skill.
    **Fix:** add both rows. Choose per destination based on the gaps above. Have `check` read Mastodon's limit from the instance configuration (apis L79).

12. **concern: claim grounding isn't enforced, which is the product's differentiator.** The research's gap 1 is "map each claim … to source PR/commit" (tools L77). The design depends on a skill prompt and human review (L100), and `check` (L68) doesn't look at claims. The brief contains `git diff --stat` (L54), which lists file names but no code. The Gist "runnable snippet" and "how to try it" (L80) therefore have nothing to draw on, and the model will make them up.
    **Fix:** have the brief include bounded diff hunks for public API, README, examples and tests. Give each draft an `evidence:` frontmatter list of brief anchors. Have `check` flag numbers, versions and code identifiers that don't appear in the brief. Skip Gist and Show HN when the brief has no runnable example.

13. **concern: the drafting agent can see credentials, and the brief is an injection risk.** The research says "avoid handing a model raw credentials" (tools L14). If `mblast` loads `.env` before starting `omp -p`, the agent inherits every token. The brief also passes PR bodies and commit messages, possibly from outside contributors, to an agent that has a shell.
    **Fix:** start the agent with a minimal allowlisted environment and load `.env` only in `publish` and `doctor`. Restrict the agent's writes to `campaigns/<slug>/drafts/`. Add this as a Risks row.

14. **concern: `doctor` only checks that environment variables exist.** An expired LinkedIn token or revoked Bluesky app password is found mid-publish, after DEV is already public (L103). That leaves a partly published campaign.
    **Fix:** `doctor` makes one authenticated read per destination, and `publish` runs the same checks before its first write. Store the LinkedIn token's issue date and warn at day 50.

15. **concern: install and reuse across repos isn't specified, and Node's type stripping blocks the obvious route.** Goal 4 (L27) needs `mblast` in many repos. Node doesn't strip types for files under `node_modules`, so an npm or npx install that ships `.ts` fails. (This is Node behaviour, not from the research; verify against the Node 26 docs.) The design also doesn't say how the skill gets into each project.
    **Fix:** emit JS from `tsc` (with `erasableSyntaxOnly`) at pack time and keep stripping for development, or document `npm link` from a clone. State how the skill is installed.

16. **concern: `mblast draft` overwrites hand-edited drafts.** L67 writes `drafts/*.md` with no rule for files that already exist.
    **Fix:** refuse when drafts exist unless `--force`, or write to `drafts/.next/` and show a diff.

17. **concern: no native-draft stage for long-form.** DEV supports `published:false` and Hashnode supports `createDraft` (apis L40, L52). The dry run is local only, so rendering problems (images, embeds) are first seen after the article is public.
    **Fix:** add `publish --stage`, which creates unpublished DEV/Hashnode posts and records their IDs. `publish --yes` then switches them to published (an update, not a create).

18. **nit: research-listed assisted platforms were dropped silently.** Medium (import flow), Threads, Product Hunt and Substack are in the research's v1 assisted set (apis L8) but have no handoff in the design. GitHub Discussions and Releases are free and native for a developer audience (tools L38) but aren't considered.
    **Fix:** add copy-only handoffs for the four platforms, or list them as non-goals with a reason. Evaluate `gh release`/Discussions as a destination.

19. **nit: some handoff prefills aren't verified.** Reddit's submit prefill is `[UNVERIFIED]` (apis L99), yet L77 lists it as a compose URL. LinkedIn share-offsite takes only a URL, not post text (apis L91). HN text posts can't be prefilled (apis L107). Handoffs also have no way to record that the human actually posted.
    **Fix:** mark which handoffs prefill text, copy the post text to the clipboard, and let `mblast mark` (from item 2) record a handoff URL.

20. **nit: the non-goals misstate the research.** "Platforms whose terms forbid it (HN, Reddit)" (L30) is inaccurate: HN has no write API, and Reddit requires approval plus care with subreddit rules (apis L13, L99).
    **Fix:** reword to "no write API (HN) or approval-gated and community-restricted (Reddit)".

21. **nit: Goal 1 promises one command but the flow uses three.** Getting to drafts takes `brief` + `draft` + `check` (L24 vs L66–68).
    **Fix:** add `mblast new <slug> --range …` that runs all three, or reword the goal.

22. **nit: Gist adds a credential the tool already has.** The brief already requires `gh` (L54).
    **Fix:** use `gh auth token` or `gh gist create` (apis L56) instead of a separate `GH_TOKEN`.

23. **nit: no testing seam is defined.** `node --test` (L85) is listed, but adapters make live HTTP calls and the `Destination` interface (L105) is never specified.
    **Fix:** define the interface (`create`, `update?`, `stage?`, `limits`, `idempotency`) with an injected `fetch`. Have the dry run print the exact request payloads, and test against recorded fixtures.

24. **nit: unpublished announcements can leak.** `campaigns/<slug>/` sits in the product repo (L46). In a public repo, drafts and `state.json` are visible before launch, and whether `state.json` is committed isn't specified.
    **Fix:** add a `campaignsDir` setting and state the commit policy for drafts and state.

No files were edited.
