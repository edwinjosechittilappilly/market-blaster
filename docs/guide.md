# Market Blaster guide

You ship a feature. Market Blaster turns that change into a post for each platform developers read and publishes it,
after you approve every post. This guide takes you from a fresh machine to a published campaign.

```mermaid
flowchart LR
  A[mblast new] --> B[edit drafts]
  B --> C[mblast check]
  C --> D[mblast approve]
  D --> E[mblast publish]
  E --> F[mblast publish --yes]
  F --> G[mblast status]
```

## 1. Install once per machine

Requires Node 22.18 or newer (`node --version`) and git. `gh` is optional; it provides PR evidence and the Gist
token.

```bash
gh repo clone edwinjosechittilappilly/market-blaster ~/Documents/GitHub/market-blaster
cd ~/Documents/GitHub/market-blaster
npm install
npm link              # puts `mblast` on your PATH, pointing at this clone
mblast install-skill  # links the drafting skill into ~/.agents/skills and ~/.claude/skills
```

Install with `npm link` from the clone. A plain `npm install -g` doesn't work, because Node only runs TypeScript
outside `node_modules`.

To update later, run `git pull && npm install`. The link keeps pointing at the clone.

## 2. Set up a project

Do this in the repo whose features you want to announce:

```bash
cd ~/code/my-project
mblast init
```

This writes `market-blaster.yml`. Fill in the following:

| Key | What to put there |
|---|---|
| `brand.name`, `brand.pitch`, `brand.audience` | Who the project is for, in one line each |
| `brand.voice` | Rules the AI must follow, such as "first person, show code, no hype words" |
| `brand.links` | Repo, docs, site |
| `destinations` | The platforms to use, from `devto hashnode gist bluesky mastodon linkedin x hn reddit threads medium producthunt substack` |
| `canonicalHome` | Where the original article lives (`devto`, `hashnode`, or your own blog URL). Other article platforms point their canonical URL at it, so search engines credit one page |
| `campaignsDir` | Where drafts and publish state go. The default is `campaigns/` inside the repo. In a public repo, drafts become visible before launch once you commit them; point this outside the repo (for example `../launches`) if that matters |
| `agent.command` | The headless agent that writes drafts. The default is `[omp, -p]`; `[claude, -p]` also works |

Commit `market-blaster.yml`. Commit `campaigns/` too if the repo is private: `state.json` is the record of what you
posted where.

## 3. Credentials

Copy `.env.example` to `.env` in the project root (`init` adds `.env` to `.gitignore`), or export the variables in
your shell. Shell values win. The drafting agent never sees these variables.

| Platform | Mode | Variables | How to get them |
|---|---|---|---|
| DEV | API | `DEV_API_KEY` | dev.to → Settings → Extensions → DEV Community API Keys |
| Hashnode | API, needs a Pro publication | `HASHNODE_TOKEN` and `hashnode.publicationId` | hashnode.com → Settings → Developer. The publication ID is in your blog dashboard URL |
| GitHub Gist | API | `GITHUB_TOKEN`, or nothing if `gh auth login` was run with the `gist` scope | `gh auth refresh -s gist` |
| Bluesky | API | `BLUESKY_IDENTIFIER`, `BLUESKY_APP_PASSWORD` (optional `BLUESKY_HOST`) | bsky.app → Settings → Privacy and security → App passwords. Never use your login password |
| Mastodon | API | `MASTODON_TOKEN`; host in `mastodon.host` or `MASTODON_HOST` | Your instance → Preferences → Development → New application, with scopes `read:accounts` and `write:statuses` |
| LinkedIn | Handoff; API when `linkedin.api: true` | `LINKEDIN_ACCESS_TOKEN` | Create an app at developer.linkedin.com, add the **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect** products, and get a 3-legged OAuth token with `openid profile w_member_social`. Tokens last about 60 days; set a reminder |
| X | Handoff; API when `x.api: true` | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | developer.x.com app with read and write permissions. API posts are billed: $0.015 each, or $0.20 with a link |
| HN, Reddit, Threads, Medium, Product Hunt, Substack | Handoff | none | No usable write API. Market Blaster prints the final copy and a compose link |

Check the setup:

```bash
mblast doctor           # api / handoff / missing per destination, with the missing variable names
mblast doctor --online  # also makes one authenticated read per API destination
```

## 4. Announce a feature

### Collect evidence and draft in one step

```bash
mblast new search-filters --range v1.3.0..HEAD --pr 42 --version 1.4.0
```

This runs three commands in a row:

1. **`mblast brief`** writes `campaigns/search-filters/brief.md`. It contains the commits, the diff stat, the diffs of
   the README, docs, examples and tests (up to 400 lines), the PR body and the CHANGELOG section. Each section has an
   anchor such as `[E3]`.
2. **`mblast draft`** runs your agent with the `market-blaster` skill. The agent writes one file per destination in
   `campaigns/search-filters/drafts/`.
3. **`mblast check`** validates the drafts.

You can also run them one at a time. Add context the commits don't show to the `Notes from the author` section of
`brief.md` (who asked for the feature, why it matters), then re-run `mblast draft search-filters --force`.

### Drafting inside omp or Claude Code

To draft interactively instead, ask your agent:

> Use the market-blaster skill to draft posts for campaign search-filters.

It reads the same brief and config and writes the same files.

### Read and edit the drafts

Each draft is Markdown with frontmatter:

```markdown
---
destination: bluesky
evidence: [E2, E7]
---
Search now takes filters: `repo:`, `lang:` and `is:open` combine in one query.

Before: three searches. After: one. Docs and examples: {{url:devto}}
```

| Field | Meaning |
|---|---|
| `evidence` | The brief sections the claims come from |
| `{{url:devto}}` | Replaced at publish time with the URL of the DEV article |
| `title` | Required for DEV, Hashnode, Gist, HN, Reddit and Substack |
| `tags`, `canonical` | Optional |

Edit freely. The AI wrote a first draft; you own the final one.

### Check

```bash
mblast check search-filters           # errors exit 1; grounding warnings don't
mblast check search-filters --strict  # warnings fail too (useful in CI)
```

Check reports errors and warnings:

- **Errors:**
  - missing fields;
  - evidence anchors that aren't in the brief;
  - posts over a platform's limit, with every link counted as 100 characters (Bluesky 300 graphemes, X 280 weighted
    characters, Mastodon your instance's limit);
  - links to a platform that publishes later.
- **Warnings:** numbers, versions and code identifiers that don't appear in the brief. These are the usual places
  where an AI invents things.

### Approve

```bash
mblast approve search-filters
```

This needs an interactive terminal. It shows each draft and asks `approve <destination>? [y/N]`. The approval records
a hash of that exact text, and publishing refuses anything that isn't approved or changed after approval. Because of
the terminal requirement, an agent can't approve on its own.

### Dry run, then publish

```bash
mblast publish search-filters                 # dry run: payloads, modes and expected cost; sends nothing
mblast publish search-filters --stage --yes   # optional: create unpublished DEV/Hashnode drafts to preview rendering
mblast publish search-filters --yes           # publish for real
mblast publish search-filters --yes --open    # also open handoff compose pages and copy their text
```

Before the first write, `publish --yes` runs a preflight:

- it checks the drafts again;
- it resolves the links;
- it re-measures social posts with the real URLs;
- it signs in to every API destination.

If any of these fails, nothing is posted. Destinations then go out in this order:

1. the canonical home;
2. the other articles;
3. Gist;
4. Bluesky, Mastodon, LinkedIn, X;
5. handoffs.

Each line of output shows a status and a URL.

### Handoffs

For HN, Reddit and similar platforms, `publish` prints the final text and a compose link. With `--open` it also
opens the link and copies the text to the clipboard. Once you've posted, record it:

```bash
mblast mark search-filters hn --url https://news.ycombinator.com/item?id=123
```

### Status

```bash
mblast status search-filters
```

## 5. When something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| `failed` | The platform returned an error. The message is saved in `state.json` with credentials removed | Fix the cause and run `publish --yes` again. Only destinations that are not yet published are tried |
| `unknown` | The request timed out, so the post may or may not exist | Check the platform. If it's there, run `mblast mark <slug> <dest> --url <url>`. If not, run `mblast mark <slug> <dest> --not-posted`, then publish again |
| `blocked` | A post links to a destination that isn't published yet | Publish or fix that destination first |
| `refused: not approved` | The draft changed after approval | Run `mblast approve <slug>` again |
| An article (DEV, Hashnode, Gist) changed after publishing | Approve and publish again | It updates the article in place. No duplicate |
| A social post changed after publishing | Social posts can't be edited | `--force` posts it again as a new post |

## 6. Use it in CI

Publishing always needs a person at a terminal, because of `approve`. CI can still keep drafts honest:

```yaml
# .github/workflows/campaign-check.yml
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { repository: edwinjosechittilappilly/market-blaster, path: .mblast, token: ${{ secrets.MBLAST_REPO_TOKEN }} }
      - uses: actions/checkout@v4
        with: { path: app }
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: cd .mblast && npm ci && npm link
      - run: cd app && for d in campaigns/*/; do mblast check "$(basename "$d")" --strict; done
```

## 7. What each platform gets

| Destination | Shape the skill writes |
|---|---|
| DEV, Hashnode | Tutorial-style article: the problem, what changed, a code example, how to try it |
| Gist | A runnable snippet with a short README, only when the brief has a runnable example |
| LinkedIn | A short story: what you built, the lesson, one link |
| Bluesky, Mastodon, X | A hook within the limit and one link |
| HN | A `Show HN:` title, only when people can try it; no marketing words |
| Reddit | Discussion framing for the subreddit in `reddit.subreddit`; read the subreddit's self-promotion rules first |
| Threads, Medium, Product Hunt, Substack | Copy for a person to paste |

## 8. Costs

| Item | Cost |
|---|---|
| DEV, Gist, Bluesky, Mastodon | Free |
| Hashnode | Pro plan |
| X API | $0.20 per post with a link (the dry run prints this) |
| LinkedIn API | Unverified; free as a handoff |
| Drafting | One agent run per campaign |
