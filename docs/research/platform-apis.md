# Platform publishing APIs

Research snapshot: 2026-11-21. API availability, pricing, quotas and app approval are subject to change. `[UNVERIFIED]` means the cited primary materials did not establish the detail; do not implement based on an assumption.

## Summary and design decisions

- **V1 auto-publish:** DEV, GitHub Gist, Bluesky and Mastodon: all have documented user-authorized write endpoints and are practical for a single developer. Gist is a code-sharing destination rather than a discovery feed. [Forem](https://developers.forem.com/api/v1), [GitHub](https://docs.github.com/en/rest/gists/gists), [Bluesky](https://bsky.network/docs/bluesky-api/creating-a-post), [Mastodon](https://docs.joinmastodon.org/methods/statuses/)
- **V1 assisted:** LinkedIn, X, Reddit, Hacker News, Medium, Threads, Product Hunt and Substack: generate platform-specific copy and open a documented compose/share flow where one exists; otherwise open the appropriate website and let the user paste and submit. Assisted is not automatic publication. [LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin), [X](https://developer.x.com/en/docs/x-for-websites/tweet-button/guides/web-intent), [HN](https://news.ycombinator.com/submit), [Medium](https://help.medium.com/hc/en-us/articles/213480228-API-Importing), [Substack](https://support.substack.com/hc/en-us/articles/50834026608916-How-to-connect-Substack-to-your-AI-Assistant)
- Hashnode has excellent Markdown, canonical and draft APIs, but **API access requires a Pro publication**, including publishing; make it an opt-in paid connector after the free v1 set rather than promising free API access. [Hashnode announcement](https://hashnode.com/changelog/2026-05-13-graphql-api-paid-access), [mutation reference](https://github.com/Hashnode/gql-skill/blob/main/skills/gql-api/references/mutations.md)
- Keep canonical URLs distinct from normal links and social cards: DEV and Hashnode explicitly support original-article canonical fields; a social link, Gist, or link card is not an SEO canonical declaration. [Forem](https://developers.forem.com/api/v1), [Hashnode](https://github.com/Hashnode/gql-skill/blob/main/skills/gql-api/references/mutations.md)
- Model drafts locally for all targets and use native drafts only where documented; secret Gists are accessible to anyone with the URL and are not private drafts. [GitHub](https://docs.github.com/en/get-started/writing-on-github/editing-and-sharing-content-with-gists/creating-gists)
- X's current primary pricing is pay-per-use, **$0.015 per create and $0.20 per create with URL**, not an assumed free write tier; verify the console before use. [X pricing](https://docs.x.com/x-api/getting-started/pricing)
- Get explicit human confirmation and respect destination-specific community rules. Reddit requires developer approval and community-specific care; Product Hunt restricts commercial API use; HN asks for substantive, non-promotional participation. [Reddit](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Reddit-Data-API-Terms), [Product Hunt](https://api.producthunt.com/v2/docs), [HN](https://news.ycombinator.com/newsguidelines.html)
- Substack now documents an official MCP service, but it is **read-only**, limited to eligible Bestseller publication admins, and cannot publish; do not equate its existence with a publishing API. [Substack](https://support.substack.com/hc/en-us/articles/50834026608916-How-to-connect-Substack-to-your-AI-Assistant)

## Comparison

`U` = [UNVERIFIED]; `local` = retain a draft in market-blaster, not a native platform draft. Rates and prices refer to API access, not all account or hosting costs. A link in a post is not a canonical URL.

| Platform | Create / authorization | Format and length | Media / canonical / drafts | Limits, cost, v1 |
|---|---|---|---|---|
| DEV | `POST /api/articles`; API key | Markdown; article limit U | Images by URL; `canonical_url`; native unpublished | API throttling varies; free account; auto |
| Hashnode | GraphQL `publishPost`; PAT | Markdown; length U | Cover/upload; `originalArticleURL`; native draft | Pro required; quotas apply; paid opt-in |
| Gist | `POST /gists`; GitHub token | Files including `.md`; size limits apply | Text files; canonical U; secret ≠ draft | GitHub API limits; generally free; auto |
| LinkedIn | `/rest/posts` or `/v2/ugcPosts`; OAuth | Plain commentary; exact max U | Image/video/article links; canonical U; local | App/product access and quota; cost U; assisted |
| X | `POST /2/tweets`; OAuth user | Plain text, normally 280 weighted characters | Upload media; canonical U; local | Pay per request; assisted |
| Bluesky | `com.atproto.repo.createRecord`; session/OAuth | Plain text, 300 graphemes | Blob images, cards; facets; canonical U; local | PDS limits; normally free on bsky.social; auto |
| Mastodon | `POST /api/v1/statuses`; OAuth | Plain text; 500 default, instance-specific | Upload media; links/cards; canonical U; scheduled, local drafts | Instance limits/cost; auto |
| Reddit | `POST /api/submit`; approved OAuth | Reddit Markdown self-post or link; limits U | Subreddit-dependent; canonical U; local | Approval/terms and subreddit rules; assisted |
| Medium | `POST /v1/users/{id}/posts` for existing integrations only | Markdown/HTML; length U | Images; `canonicalUrl`; draft | No new tokens/integrations; assisted |
| HN | No documented submission API; web form | Link or text; limits U | No native uploaded images/canonical; local | Community rules; assisted |
| Threads | Create container then `threads_publish`; OAuth | Plain text, 500 characters | Images/video; canonical U; container is not a durable draft | 250 published posts/24h; cost U; assisted |
| Product Hunt | No documented launch-create mutation found; GraphQL write is limited | Launch form; limits U | Launch media; canonical U; local | Commercial API prohibited absent permission; assisted |
| Substack | No documented public publishing endpoint found | Web editor; limits U | Images; canonical U; editor drafts | MCP is read-only and eligibility-limited; assisted |

## Platform details

### DEV / Forem

Create a DEV account, generate an API key in account settings, and send `api-key` with `POST https://dev.to/api/articles`. The JSON `article` accepts `title`, `body_markdown`, `published`, `tags`, `main_image` and `canonical_url`; `published: false` creates an unpublished article. Images can be included using URLs in Markdown or as a cover. Max body size and the applicable create quota are [UNVERIFIED]; respect 429 responses and instance-specific limits. Basic use is free; commercial/automation restrictions beyond normal community rules are [UNVERIFIED]. [API reference](https://developers.forem.com/api/v1), [DEV terms](https://dev.to/terms).

```sh
curl -X POST https://dev.to/api/articles \
  -H "api-key: $DEV_API_KEY" -H 'Content-Type: application/json' \
  -d '{"article":{"title":"What we shipped","body_markdown":"We shipped **a feature**.","published":false,"canonical_url":"https://example.com/post"}}'
```

Set `published` to `true` only after user approval.

### Hashnode

Create a publication, upgrade it to Pro, generate a personal access token, and obtain its publication ID. Send bearer-authenticated GraphQL requests to `https://gql.hashnode.com`; use `publishPost(input: {publicationId, title, contentMarkdown, originalArticleURL})`. `createDraft` and `publishDraft` provide native draft workflows. `createImageUploadURL`, a presigned PUT and `confirmImageUpload` support images; the documented cap is 8 MB, `image/*` except SVG. Title/body maxima and exact current quota are [UNVERIFIED]; consult the live [rate-limit documentation](https://docs.hashnode.com/quickstart/introduction/rate-limits). API access for reading and publishing requires Pro, so this is a paid opt-in rather than the default free v1 set. Automation-specific policy beyond the ordinary terms is [UNVERIFIED]. [Pro requirement](https://hashnode.com/changelog/2026-05-13-graphql-api-paid-access), [official recipe](https://github.com/Hashnode/gql-skill/blob/main/skills/gql-api/references/recipes.md), [mutations](https://github.com/Hashnode/gql-skill/blob/main/skills/gql-api/references/mutations.md).

### GitHub Gist

Run `gh auth login` and authorize gist access, or create a token with the GitHub Gists permission / classic `gist` scope. `POST https://api.github.com/gists` takes a `files` object and `public` boolean; Markdown renders from `.md` files. `gh gist create --public post.md` is an alternative. Gists are versioned text files, not an article publishing API with a documented canonical field. Secret gists are unlisted, not private; there is no documented native draft state. GitHub documents gist size restrictions and primary/secondary API limits; check them dynamically rather than treating a single ceiling as universal. Basic GitHub accounts are free; avoid spam and respect GitHub terms. [REST](https://docs.github.com/en/rest/gists/gists), [gist visibility](https://docs.github.com/en/get-started/writing-on-github/editing-and-sharing-content-with-gists/creating-gists), [limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [CLI](https://cli.github.com/manual/gh_gist_create).

```sh
curl -X POST https://api.github.com/gists \
  -H "Authorization: Bearer $GH_TOKEN" -H 'Accept: application/vnd.github+json' \
  -d '{"description":"Feature notes","public":true,"files":{"feature.md":{"content":"# Feature\nWe shipped it."}}}'
```

### Bluesky

Create an account and an app password in settings; for a multi-user product prefer AT Protocol OAuth. Authenticate at the user's PDS with `POST /xrpc/com.atproto.server.createSession` using identifier and app password; use the returned access JWT and DID in `POST /xrpc/com.atproto.repo.createRecord`, collection `app.bsky.feed.post`. The current record schema limits text to 300 graphemes and 3,000 bytes. Rich links and mentions need facets with **UTF-8 byte offsets**, not character offsets; a link card is an `app.bsky.embed.external` record, with metadata and optional uploaded thumbnail supplied by the client. Upload blobs separately for image embeds. A link card is not a canonical field; native draft support is [UNVERIFIED]. bsky.social documents point-based per-account write limits; other PDS policies may differ. Account use is generally free; bots must follow network and service rules. [Posting](https://bsky.network/docs/bluesky-api/creating-a-post), [schema](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/post.json), [limits](https://docs.bsky.app/docs/advanced-guides/rate-limits), [community guidelines](https://bsky.social/about/support/community-guidelines).

```sh
# Obtain DID and accessJwt from createSession; use your account's actual PDS host.
curl -X POST https://bsky.social/xrpc/com.atproto.repo.createRecord \
  -H "Authorization: Bearer $BSKY_ACCESS_JWT" -H 'Content-Type: application/json' \
  -d "{\"repo\":\"$BSKY_DID\",\"collection\":\"app.bsky.feed.post\",\"record\":{\"\$type\":\"app.bsky.feed.post\",\"text\":\"We shipped a feature!\",\"createdAt\":\"2026-11-21T12:00:00.000Z\"}}"
```

Use the actual current RFC 3339 timestamp at runtime. Session tokens expire; reauthenticate or refresh according to the protocol.

### Mastodon

Choose the account's home instance, create an application in its development settings or register via `POST /api/v1/apps`, then obtain a user OAuth token with `write:statuses` (and `write:media` when needed). `POST https://{instance}/api/v1/statuses` takes plain `status`, optional uploaded `media_ids[]`, visibility and `scheduled_at`; media is uploaded separately. Default Mastodon limit is 500 characters, but use the instance's advertised configuration, not a hardcoded universal value. A scheduled status is not a native draft; canonical SEO support is [UNVERIFIED]. `Idempotency-Key` prevents duplicates for up to an hour. Instance rate limits, costs and bot rules vary; check the instance's terms and 429 headers. [Statuses](https://docs.joinmastodon.org/methods/statuses/), [instance configuration](https://docs.joinmastodon.org/entities/Instance/), [rate limits](https://docs.joinmastodon.org/api/rate-limits/), [apps](https://docs.joinmastodon.org/methods/apps/).

```sh
curl -X POST "https://$MASTODON_HOST/api/v1/statuses" \
  -H "Authorization: Bearer $MASTODON_TOKEN" -H "Idempotency-Key: $POST_UUID" \
  --data-urlencode 'status=We shipped a feature!'
```

### LinkedIn

Register a LinkedIn developer app, request the self-serve **Share on LinkedIn** product and authorize the member via OAuth 2.0 with `w_member_social`; app/product access and approval are distinct from member consent. LinkedIn describes this as an open/self-serve permission, rather than universally requiring the restricted Marketing partner review, but app verification/product onboarding requirements can change. Access tokens are generally valid for 60 days; refresh availability depends on program access, so plan for reauthorization. [Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access), [share product](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin), [OAuth](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow).

`POST https://api.linkedin.com/rest/posts` is the versioned Posts API; the consumer share documentation also shows `POST https://api.linkedin.com/v2/ugcPosts`. Versioned access/headers and availability must be checked for the app's granted products; do not assume `w_member_social` alone grants every Marketing API. Posts support text, uploaded media and article links. Exact text limit, native drafts, canonical support, rate quota and API price are [UNVERIFIED]. For assisted sharing open `https://www.linkedin.com/sharing/share-offsite/?url=<encoded-url>`; this shares a URL, **not arbitrary prefilled post copy**, which must be pasted manually. [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api), [share plugin](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/plugins/share-plugin). Automated activity remains subject to LinkedIn's [developer terms](https://www.linkedin.com/legal/l/api-terms-of-use).

### X

Create a developer app, configure user-context OAuth 2.0 or OAuth 1.0a and post `{"text":"..."}` to `POST https://api.x.com/2/tweets`; media requires separate upload. Standard posts use a 280 weighted-character limit; longer posts depend on account eligibility. Canonical SEO and API drafts are [UNVERIFIED]. Current first-party pricing is **pay-per-use with no subscription**, $0.015/create or $0.20/create containing a URL; enterprise arrangements differ. A current free-tier write allowance is **[UNVERIFIED]**: do not reuse historical free-tier quotas. Consult console prices and [rate-limit headers](https://docs.x.com/x-api/fundamentals/rate-limits) at runtime. Follow [automation rules](https://help.x.com/en/rules-and-policies/x-automation). Assisted: `https://twitter.com/intent/tweet?text=<encoded-text>&url=<encoded-url>` opens a user-controlled composer. [Pricing](https://docs.x.com/x-api/getting-started/pricing), [create](https://docs.x.com/x-api/posts/manage-tweets/introduction), [intent](https://developer.x.com/en/docs/x-for-websites/tweet-button/guides/web-intent).

### Reddit

Reddit's current Responsible Builder Policy requires approval before accessing developer resources; register an app and seek approval, then use user OAuth with `submit` scope for `POST https://oauth.reddit.com/api/submit` (`sr`, `kind=self` and `text`, or `kind=link` and `url`, plus `title`). Self posts use Reddit Markdown; media support and post constraints depend on subreddit and submission type. Exact length limits, native API drafts and canonical field are [UNVERIFIED]. Published quotas depend on approval and current policy; do not assume historical free allowances apply to every app. Commercial terms/access must be checked with Reddit. Respect subreddit rules, rate limits and spam/self-promotion restrictions; do not automatically cross-post promotional copy. Assisted: open the target subreddit's submit page and manually compose; prefill behavior is [UNVERIFIED]. [API](https://www.reddit.com/dev/api/#POST_api_submit), [policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Reddit-Data-API-Terms), [wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki), [spam](https://support.reddithelp.com/hc/en-us/articles/28012014962580-How-do-I-keep-spam-out-of-my-community).

### Medium

Medium explicitly says it will issue **no new API integration tokens and allow no new integrations**, while existing tokens continue working. Existing integrations can use bearer auth and `POST https://api.medium.com/v1/users/{authorId}/posts`, with `contentFormat` `html` or `markdown`, `canonicalUrl`, and `publishStatus` including draft. The legacy API also documents image upload; article length limit, current quotas and cost are [UNVERIFIED]. New developers should use Medium's import/editor flow instead of building a new connector. Automation remains subject to its API terms for existing integrations. [Current availability](https://help.medium.com/hc/en-us/articles/213480228-API-Importing), [legacy API](https://github.com/Medium/medium-api-docs), [terms](https://help.medium.com/hc/en-us/articles/214151487-Medium-API-Terms-of-Use).

### Hacker News

The official Firebase API documents reading items, users and lists, not a submission/write operation; no official API submission endpoint was found. Use `https://news.ycombinator.com/submitlink?u=<encoded-url>&t=<encoded-title>` to open a prefilled submission form; user login and final submission are required. Text submissions are composed on the site; limits and prefill behavior across sessions are [UNVERIFIED]. No API media uploads, SEO canonical field or native API drafts are documented. Cost/rate limits are [UNVERIFIED]. Follow HN guidelines: do not ask for votes or post promotional material repeatedly; Show HN must be something people can try. [Official API](https://github.com/HackerNews/API), [submission](https://news.ycombinator.com/submit), [guidelines](https://news.ycombinator.com/newsguidelines.html), [Show HN](https://news.ycombinator.com/showhn.html).

### Threads

Create a Meta app configured for Threads, complete applicable app setup/review, authorize a user with `threads_basic` and `threads_content_publish`, and exchange tokens per Meta's OAuth flow. Create a container with `POST https://graph.threads.net/v1.0/{threads-user-id}/threads` (`media_type=TEXT`, `text=...`; media containers use image/video URLs), then publish its ID with `POST https://graph.threads.net/v1.0/{threads-user-id}/threads_publish`. Meta also accepts `graph.threads.com`. Text is limited to 500 characters; image formats are JPEG/PNG up to 8 MB and video restrictions apply. Containers are a publishing staging step, not a documented long-lived draft; canonical support and cost are [UNVERIFIED]. API-published posts are limited to 250 per profile per rolling 24 hours, plus application call limits. Review and automation obligations depend on app access and Meta terms. [Overview and limits](https://developers.facebook.com/documentation/threads/overview), [getting started](https://developers.facebook.com/documentation/threads/get-started), [publishing](https://developers.facebook.com/documentation/threads/create-posts). Assisted: open Threads and paste; a supported prefilled intent is [UNVERIFIED].

### Product Hunt

The documented GraphQL endpoint is `https://api.producthunt.com/v2/api/graphql`; register an app and use OAuth or a developer token. Applications are read-only by default; partial write access needs Product Hunt approval and `public private write` scopes. The published mutation reference does not establish a product-launch creation mutation, so **a supported launch-create API is [UNVERIFIED]**, not an assumption that all write operations are impossible. API use for commercial purposes is prohibited by default without permission; fair-use throttles apply. Launch format, media, limits, canonical and drafts via an API are [UNVERIFIED]. Use the human launch workflow instead. [API policy](https://api.producthunt.com/v2/docs), [mutation reference](https://api-v2-docs.producthunt.com/operation/mutation/), [launch guide](https://www.producthunt.com/launch).

### Substack

No supported public create-post endpoint was found in the accessible official sources; that is not proof that no private or partner API exists. Its official MCP server at `https://mcp.substack.com/api/v1/mcp` is explicitly read-only and cannot publish posts or Notes; it requires a Bestseller publication admin and user authorization. Endpoint, programmatic authoring format, length, media, canonical, publishing quotas, API cost and automation terms are [UNVERIFIED]. Use the web editor for manual drafting and publication; the official guide documents the flow. Avoid relying on undocumented cookie-based endpoints. [MCP](https://support.substack.com/hc/en-us/articles/50834026608916-How-to-connect-Substack-to-your-AI-Assistant), [publishing](https://support.substack.com/hc/en-us/articles/360037831771-How-do-I-publish-a-new-post-on-Substack).

## Sources

Primary sources are linked inline above. Core references: [Forem API](https://developers.forem.com/api/v1); [Hashnode API and pricing change](https://hashnode.com/changelog/2026-05-13-graphql-api-paid-access); [GitHub Gists API](https://docs.github.com/en/rest/gists/gists); [LinkedIn API access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access); [X pricing](https://docs.x.com/x-api/getting-started/pricing); [Bluesky post guide](https://bsky.network/docs/bluesky-api/creating-a-post); [Mastodon statuses](https://docs.joinmastodon.org/methods/statuses/); [Reddit API terms](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Reddit-Data-API-Terms); [Medium availability](https://help.medium.com/hc/en-us/articles/213480228-API-Importing); [HN API](https://github.com/HackerNews/API); [Threads overview](https://developers.facebook.com/documentation/threads/overview); [Product Hunt API](https://api.producthunt.com/v2/docs); [Substack MCP](https://support.substack.com/hc/en-us/articles/50834026608916-How-to-connect-Substack-to-your-AI-Assistant).
