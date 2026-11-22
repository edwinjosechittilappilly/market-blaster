# Auth, access and reach plan

Status: **approved 2026-11-22** with these owner decisions:

- X uses the free intent link, not the paid API.
- LinkedIn uses the API, renewed with `mblast auth linkedin`.
- Hashnode is off.
- Build GitHub Discussions and `publish --assist`.
- Research more free destinations.
- Credentials live in the macOS Keychain.

Bead: market-blaster-88g.16 · Gates: dogfood (.15)

Sources: [auth and access research](../research/auth-and-access.md), [browser relay research](../research/browser-relay.md),
[platform APIs](../research/platform-apis.md). Reach tiers are judgement, not measured impressions: tier 1 is the
largest relevant developer or founder audience, tier 3 is mostly people who already follow the project.

## What the research changed

1. **No browser automation anywhere.** These terms prohibit scripting the site, and a human final click does not
   make it allowed:
   - LinkedIn User Agreement §8.2;
   - the X automation rules ("non-API-based forms of automation, such as scripting the X website");
   - the Threads/Instagram terms;
   - the HN guidelines ("please don't automate posting").

   omp's browser relay and Playwright MCP are therefore **not used for posting**. Platforms without an API get the
   official share or compose URL, or the editor page, opened in **your normal browser**. Your logins stay in that
   browser's own profile, so Market Blaster stores no browser credentials. You paste, you click Post, and
   `mblast mark` records the permalink.
2. **Some communities forbid AI-written text.**
   - HN: "Please don't put generated text in HN posts."
   - daily.dev rejects AI-generated content.
   - Buttondown forbids primarily machine-generated prose.

   DEV requires substantial content that is not mainly promotion. Every destination therefore gets an AI policy:

   | Policy | Destinations | What the AI does |
   |---|---|---|
   | `none` | HN | Nothing. `mblast` prints only the original article URL and title; you write any text yourself |
   | `outline` | Reddit, Lobsters, daily.dev, newsletter | Writes talking points and the evidence. You write the post |
   | `draft` | DEV, Hashnode, Gist, LinkedIn, X, Bluesky, Mastodon, Threads, Medium | Writes a first draft. You edit it; `approve` makes you read it |

3. **Token expiry decides the ongoing chore.**
   - **Never expire:** X OAuth 1.0a user tokens, Bluesky app passwords, Mastodon tokens, the DEV API key.
   - **About 60 days:** LinkedIn tokens. Threads tokens need a refresh every 60 days and the grant lasts 90.

## Decisions per platform (maximum reach for least ongoing work)

| Tier | Platform | Access path | One-time setup (you) | Recurring chore | AI policy |
|---|---|---|---|---|---|
| 1 | DEV | API, canonical home | API key (2 min) | none | draft |
| 1 | LinkedIn (personal) | API, with `mblast auth linkedin` to renew | Developer app with **Share on LinkedIn** and **OpenID Connect** (10 min) | Run `mblast auth linkedin` every ~60 days; `doctor` warns at day 50 | draft |
| 1 | X | **Free intent link, chosen by the owner** (`x.com/intent/post?text=`, full text prefilled). The paid API stays available later as `x.api: true` | Account | none | draft |
| 1 | Hacker News | Manual, human-written | Account | Submit selectively | none |
| 1 | Reddit | Manual handoff (subreddit submit URL) | Account; pick 2–3 subreddits and read their rules | Read the subreddit rules before each post | outline |
| 1 | Product Hunt | Manual, only for real launches | Account and launch assets | Per launch | outline |
| 2 | Bluesky | API | App password (2 min) | none | draft |
| 2 | Mastodon | API | Create an account on **hachyderm.io**: tech professionals, about 7.5k monthly actives, sign-ups need approval, 2,263-character limit. If you want an account right away, mastodon.social (265k monthly actives, open sign-up). Following is federated, so reach comes from hashtags and boosts more than from the instance. Token with `write:statuses read:accounts` (3 min) | none | draft |
| 2 | Medium | Manual import of the canonical URL (`medium.com/p/import`), which keeps the canonical | Account | One minute per article | draft (import) |
| 2 | Threads | Manual intent link | Account | none | draft |
| 2 | Hashnode | **Off by default.** API needs Pro ($5/month) | Pro, token, publication ID | Pay Pro | draft |
| 2 | daily.dev, Lobsters | Manual, human-written, only where it fits (Lobsters is invite-only) | Account | none | outline |
| 3 | GitHub Discussions (Announcements) | **New** API destination through `gh` | Enable Discussions on the repo | none | draft |
| 3 | Gist | API through `gh auth token` | `gh auth refresh -s gist` | none | draft, only when the brief has a runnable example |
| 3 | Discord | **New, optional** webhook destination | Webhook URL for a server you run | Rotate if leaked | draft |

Not in v1:

- **Typefully, Buffer and Postiz:** another vendor and account to maintain, for X/LinkedIn/Threads reach that the
  official API or manual paths already cover.
- **Substack, Buttondown, Telegram:** only worth it once you have a list or channel.
- **YouTube and Instagram:** they need video or visual work.

### Canonical home

DEV is the canonical home until you run your own blog. Then set `canonicalHome` to the blog URL, and DEV and Medium
point their canonical URL at it.

### Reach practices the skill will encode

All of these are judgement, and the skill states them as defaults, not guarantees:

- **LinkedIn:** native text first. Open with a specific outcome in the first two lines, put the link at the end, add
  3 hashtags at most, and avoid "excited to announce".
- **X and Bluesky:** a concrete hook, plus a code snippet or a before/after. One link.
- **Mastodon:** CamelCase hashtags (accessibility) and a content warning only when needed.
- **Reddit:** lead with the problem and what you learned. Disclose that it's your project. Never post the same text
  to several subreddits.
- **HN:** submit the article itself under its original title. `Show HN:` only when people can try it now.
- **Timing:** publish the canonical article first, then social within the same hour, while a post still counts as
  fresh.

## Where credentials live

Credentials are global per machine, not per project. That way one setup serves every repo you announce from.

| Order | Source | Notes |
|---|---|---|
| 1 | Shell environment | Wins, for CI or one-off overrides |
| 2 | Project `.env` | Existing behaviour |
| 3 | **macOS Keychain**, service `market-blaster` | **New.** Encrypted at rest, never in git |

New commands:

- `mblast auth set <VAR>` prompts with hidden input and writes the value to the Keychain.
- `mblast auth list` shows which variables are set, never their values.
- `mblast auth linkedin` runs the OAuth flow:
  1. starts a loopback server on `127.0.0.1`;
  2. opens LinkedIn's consent page in your browser;
  3. exchanges the code;
  4. stores the token and its issue date.

  The LinkedIn client id and secret are themselves stored in the Keychain.

Browser sessions for the manual destinations stay in your normal browser. Market Blaster never reads them.

## Build items this adds (beads under the epic)

1. Credential store: Keychain loader plus `mblast auth set|list`. `doctor` shows the source of each credential.
2. `mblast auth linkedin` loopback OAuth, with the token issue date and a warning at day 50.
3. Per-destination AI policy (`none | outline | draft`) in metadata, the skill and `check`:
   - HN is draft-less: its handoff is built from the canonical article.
   - A draft can declare `skip: <reason>` (for example, Gist without a runnable example).
4. `mblast publish --assist`: walks the handoffs one at a time. For each it opens the compose URL in the default
   browser, copies the text (never for HN), waits for you, and asks for the permalink to `mark`.
5. New destinations: `github-discussion` (gh GraphQL `createDiscussion`, Announcements category) and `discord`
   (webhook, optional).
6. Rework the skill with the reach practices above and the AI policies.

## Your one-time local setup (after approval, about 45 minutes)

```bash
cd ~/Documents/GitHub/market-blaster && npm install && npm link && mblast install-skill
mblast auth set DEV_API_KEY              # dev.to → Settings → Extensions
mblast auth set BLUESKY_IDENTIFIER       # you.bsky.social
mblast auth set BLUESKY_APP_PASSWORD     # bsky.app → Settings → App passwords
mblast auth set MASTODON_TOKEN           # instance → Preferences → Development
gh auth refresh -s gist                  # Gist through gh
# X: nothing to set up; publish opens the intent link with the text prefilled
mblast auth set LINKEDIN_CLIENT_ID       # and LINKEDIN_CLIENT_SECRET, then:
mblast auth linkedin
mblast doctor --online                   # every API destination must show "online: ok"
```

Then dogfood in this order:

1. `mblast new market-blaster --range <first>..HEAD` in this repo.
2. Edit the drafts and run `check`.
3. `approve`.
4. `publish` (dry run).
5. `publish --stage --yes`, which creates DEV unpublished drafts.
6. Review them on DEV.
7. `publish --yes`.
8. `publish --assist` for the handoffs.
