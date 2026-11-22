# Spec Delta

## Purpose

Sends human-approved drafts to each destination, or hands them to the user with a compose link, without ever posting
the same content twice and with an honest per-destination record of what happened.

## ADDED Requirements

### Requirement: Human approval gate
`mblast approve <slug>` SHALL require an interactive terminal, show each draft's resolved text, and record the approved
content hash per destination in `state.json`. Publishing SHALL refuse any draft with no approval or whose current
hash differs from the approved one.

#### Scenario: Not a TTY
- **WHEN** `mblast approve search` runs with stdin not a terminal
- **THEN** it exits 1 and records nothing

#### Scenario: Edited after approval
- **WHEN** `drafts/devto.md` changes after approval and `publish --yes` runs
- **THEN** devto is refused as not approved and nothing is sent for it

### Requirement: Dry run by default
`mblast publish <slug>` without `--yes` SHALL make no network write, SHALL leave `state.json` unchanged, and SHALL print
per destination the mode, the resolved text or request payload, and the expected cost where the platform charges.

#### Scenario: No --yes
- **WHEN** `mblast publish search` runs with approved drafts and credentials
- **THEN** no write request is sent and output shows `x` with an expected cost of $0.20

### Requirement: Preflight before the first write
Before any write, publishing SHALL run `check`, resolve links, re-check social lengths using known URLs (100 characters
for unknown ones), and, for API destinations, perform one authenticated read. Any failure SHALL abort with nothing
published.

#### Scenario: Bad credential
- **WHEN** the Mastodon token is revoked and `publish --yes` runs
- **THEN** preflight fails naming mastodon and no destination is published

### Requirement: Publish order and links from state
Destinations SHALL publish in the order: canonical home, other long-form, gist, bluesky, mastodon, linkedin, x,
handoffs. `{{url:<destination>}}` SHALL resolve from `state.json`; a draft whose link target is not `published` SHALL
be recorded `blocked` with the reason and not posted.

#### Scenario: Social links to the article
- **WHEN** devto is published at U and `drafts/bluesky.md` contains `{{url:devto}}`
- **THEN** the Bluesky post text contains U, including on a later rerun where devto is skipped

#### Scenario: Link target failed
- **WHEN** devto fails and `drafts/bluesky.md` contains `{{url:devto}}`
- **THEN** bluesky is recorded `blocked` with a reason naming devto

### Requirement: Canonical home
When `canonicalHome` names a destination or URL, every other long-form destination SHALL send it as its canonical field
(DEV `canonical_url`, Hashnode `originalArticleURL`) unless the draft sets `canonical` itself.

#### Scenario: Hashnode canonical to DEV
- **WHEN** `canonicalHome: devto` and devto published at U
- **THEN** the Hashnode request sets `originalArticleURL` to U

### Requirement: No duplicate posts
Before each write the system SHALL record status `pending`, then `published` with id and URL on success, `failed` on an
HTTP error, and `unknown` on a timeout or dropped connection. A destination `published` with the same hash SHALL be
skipped. A destination in `unknown` SHALL be refused until `mblast mark` resolves it. Retries SHALL happen only on HTTP
429 or connection refused.

#### Scenario: Rerun after partial failure
- **WHEN** devto is published and mastodon failed, then `publish --yes` runs again
- **THEN** devto is skipped and only mastodon is attempted

#### Scenario: Timeout
- **WHEN** the Bluesky request times out
- **THEN** bluesky is recorded `unknown` and the next `publish --yes` refuses bluesky until `mblast mark`

### Requirement: Update instead of duplicate for articles
A long-form destination already `published` with a different approved hash SHALL be updated in place using the stored
id. A social destination in that state SHALL be refused unless `--force`, which posts anew.

#### Scenario: Typo fix on DEV
- **WHEN** devto is published with id 7 and an edited, re-approved draft is published
- **THEN** the request is `PUT /api/articles/7` and no new article is created

### Requirement: Staging long-form drafts
`publish --stage --yes` SHALL create unpublished DEV and Hashnode drafts, record them `staged`, and skip every other
destination; a later `publish --yes` SHALL publish staged entries by update, not create. With `devto.publish: false`
a normal publish also records DEV as `staged`.

#### Scenario: Stage then publish DEV
- **WHEN** `--stage --yes` then `--yes` run for devto
- **THEN** the first call sends `published: false`, the second updates the same id with `published: true`

#### Scenario: Stage run leaves socials alone
- **WHEN** `publish --stage --yes` runs with bluesky enabled
- **THEN** no request is sent to Bluesky

### Requirement: Uncertain outcomes are never retried blindly
Timeouts, dropped connections, gateway errors (502, 503, 504, 522, 524) and unparsable success bodies SHALL be recorded
`unknown`; a failed or unknown update of a live article SHALL keep it `published` and record `lastAttempt`. Only HTTP
429 (honouring `Retry-After`) and refused connections SHALL be retried, at most twice. Only one publish, approve or
mark run per campaign SHALL hold the state lock at a time.

#### Scenario: Gateway timeout
- **WHEN** Bluesky returns 504 to the create request
- **THEN** bluesky is `unknown` and the next run refuses it until `mark`

#### Scenario: Concurrent runs
- **WHEN** a second `publish --yes` starts while the first holds the lock
- **THEN** the second exits 1 without sending anything

### Requirement: Handoffs
Destinations without API access SHALL get a handoff: a compose or submit URL where one exists (HN, Reddit, X,
LinkedIn, Threads, Medium, Product Hunt, Substack, Lemmy, newsletter submissions) and status `handoff`. With `--open`
the URL SHALL open in the default browser and, for `ai: draft` destinations only, the text SHALL be copied. The system
SHALL NOT script or submit any platform's web page. X and LinkedIn SHALL use API mode only when `api: true` and
credentials are present.

#### Scenario: HN handoff
- **WHEN** `hn` is enabled and devto is published at U with title T
- **THEN** output includes `https://news.ycombinator.com/submitlink?u=<U encoded>&t=<T encoded>`, nothing is copied, and state records `handoff`

#### Scenario: X without api flag
- **WHEN** X credentials are set but `x.api` is not true
- **THEN** X is a handoff with an intent URL containing the encoded text

### Requirement: Assisted handoff walkthrough
`publish --assist` SHALL require a TTY and, for each handoff not yet published, show the copy per its AI policy, open
the compose URL, then ask for the permalink, accept it only when it is https on the destination's host, and record it
`published`; Enter skips and `s` stops.

#### Scenario: Wrong host rejected
- **WHEN** the user pastes `https://example.com/post` for reddit
- **THEN** it is rejected and the prompt repeats

### Requirement: Manual resolution
`mblast mark <slug> <destination> --url <U>` SHALL record the destination `published` with that URL and the approved
hash; `--not-posted` SHALL clear an `unknown` status, and on an entry that has a remote id SHALL restore it so the next
publish updates rather than creates.

#### Scenario: Record a handoff
- **WHEN** `mblast mark search hn --url https://news.ycombinator.com/item?id=1` runs
- **THEN** state shows hn `published` with that URL

#### Scenario: Not posted after an update timeout
- **WHEN** devto id 7 is live, an update times out, and `mark search devto --not-posted` runs
- **THEN** the next publish sends `PUT /api/articles/7` and no `POST`

### Requirement: Launch checklist
`mblast launch` SHALL keep a one-time-per-project checklist of launch directories (DevHunt, AlternativeTo, Uneed,
Indie Hackers, Product Hunt) with submit URLs and listing status; `--mark <directory> --url <U>` SHALL record a listing.

#### Scenario: Record a listing
- **WHEN** `mblast launch --mark devhunt --url https://devhunt.org/tool/x` runs
- **THEN** `mblast launch` shows devhunt listed with that URL

### Requirement: Independent failures, exit code and status
A failure on one destination SHALL NOT stop the others. Publish SHALL print one line per destination and exit 1 if any
is `failed`, `unknown` or `blocked`. `mblast status <slug>` SHALL print each destination's status, URL and time.

#### Scenario: One platform down
- **WHEN** mastodon returns HTTP 500 and the rest succeed
- **THEN** the others are published, mastodon is `failed` with the HTTP status, and the exit code is 1
