# Configuration reference

`mblast init` creates `market-blaster.yml` in the current directory. Other project commands search upward for the first file of that name; its directory is the project root. Relative campaign paths resolve from that root. The starter is an example, not the complete set of supported keys.

| Key | Meaning and default |
|---|---|
| `brand.name` | Required nonempty project name. |
| `brand.pitch` | Optional one-sentence description. |
| `brand.audience` | Optional intended audience. |
| `brand.voice` | Optional list of voice instructions. |
| `brand.links` | Optional mapping of link names to URLs. |
| `brand.hashtags` | Optional list of hashtags. |
| `destinations` | Required nonempty list of known destination IDs; see [destinations](destinations.md). Starter: `devto`, `gist`, `bluesky`, `mastodon`, `linkedin`, `x`, `hn`, `reddit`. |
| `canonicalHome` | Optional `devto`, `hashnode`, or HTTP(S) URL. A destination ID must also be enabled. The starter uses `devto`. |
| `campaignsDir` | Campaign directory, default `campaigns`. Can point outside the repository. |
| `agent.command` | Nonempty argument array for the drafting agent; default `[omp, -p]`. The prompt is appended as the final argument. |
| `agent.timeoutSeconds` | Positive drafting timeout in seconds; default `900`. |
| `devto.tags` | Default DEV tags; at most four lowercase alphanumeric tags. Draft tags take precedence. |
| `devto.publish` | Set `true` to create published articles; otherwise a new DEV article is unpublished. Starter: `false`. |
| `hashnode.publicationId` | Hashnode publication ID, required for API mode. The starter leaves it empty. |
| `gist.public` | Whether new Gists are public; default `true`. |
| `githubDiscussion.repo` | GitHub repository as `owner/name`; required when `github-discussion` is enabled. |
| `githubDiscussion.category` | Nonempty discussion category name, required when `github-discussion` is enabled. |
| `nostr.relays` | List of `wss://` relay URLs; defaults to `wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.nostr.band`. |
| `lemmy.instance` | Bare hostname, e.g. `programming.dev`; used with `lemmy.community` to construct the handoff URL. |
| `lemmy.community` | Community name for the Lemmy handoff. |
| `newsletter.targets` | List from `console-dev`, `javascript-weekly`, `golang-weekly`, `changelog-news`; required and nonempty when `newsletter` is enabled. Defaults to `[]`. |
| `bluesky.host` | Bluesky PDS hostname; default `bsky.social`, overridden by `BLUESKY_HOST`. |
| `bluesky.langs` | Language codes for posts; default `[en]`. |
| `mastodon.host` | Instance hostname, overridden by `MASTODON_HOST`; one is required for API mode. Starter: `mastodon.social`. |
| `mastodon.maxChars` | Local status length limit, default `500`; online preflight can replace it with the instance's advertised limit. |
| `linkedin.api` | Set `true` to opt into API posting; otherwise use a handoff. Starter: `false`. |
| `x.api` | Set `true` to opt into the paid API; otherwise use the intent-link handoff. Starter: `false`. |
| `reddit.subreddit` | Subreddit name used to build the submit URL. Starter: `programming`. |
| `substack.url` | Publication base URL used to build the editor handoff. Starter: empty. |
| `hn.title` | Human-written HN submission title when the canonical home is an external URL. With a destination home, the published article title is used. |

## Credentials and environment

Nonempty shell values take precedence over the project-root `.env`, which takes precedence over macOS Keychain service `market-blaster`. `mblast init` writes `.env.example` and adds `.env` to `.gitignore`; never commit secrets. `mblast auth set <KEY>` saves a supported key in Keychain, and `mblast auth list` shows the source. On non-macOS use the shell or `.env`. Gist and GitHub Discussions fall back to `gh auth token` when `GITHUB_TOKEN` is absent.

| Variables | Purpose |
|---|---|
| `DEV_API_KEY` | DEV API key. |
| `HASHNODE_TOKEN` | Hashnode API token. |
| `GITHUB_TOKEN` | Gist or GitHub Discussions token with appropriate permissions. |
| `BLUESKY_IDENTIFIER`, `BLUESKY_APP_PASSWORD` | Bluesky account and app password. |
| `BLUESKY_HOST` | Optional PDS hostname override. |
| `MASTODON_TOKEN`, `MASTODON_HOST` | Mastodon token and optional hostname override. |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn API token. |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth app credentials for `mblast auth linkedin`. |
| `LINKEDIN_TOKEN_ISSUED` | Token issue date, used for renewal warnings. |
| `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | X API consumer and user credentials. |
| `NOSTR_PRIVATE_KEY` | Nostr signing key; keep private. |

See the [command reference](commands.md) for authentication and publishing options.
