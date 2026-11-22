# Tasks

## 1. Studio import contract

- [ ] 1.1 Define manifest v1 and review-hash canonicalization with Studio using shared fixtures; verify matching field interpretation and hashes on both sides.
- [ ] 1.2 Implement import, campaign-local media copying, unexported enabled-destination skips and unsupported-version rejection; verify with partial and invalid package tests.
- [ ] 1.3 Guard all approved drafts before replacement, implement `--force`, preserve review metadata and run campaign check; verify refusal, force, approval invalidation and check-failure tests.
- [ ] 1.4 Import threads as manual handoff text files and warn on stale Studio review; verify thread non-posting and changed versus unchanged hash tests.
- [ ] 1.5 Document manifest import, force and review warnings; verify examples against the shared fixtures.

## 2. Media validation and approval

- [ ] 2.1 Parse media metadata and validate local files, alt text and destination sizes; verify missing, invalid and boundary cases with check tests.
- [ ] 2.2 Add media content to approval hashing and list paths and alt text with previews in approval; verify changed bytes require reapproval and preview invocation is tested.
- [ ] 2.3 Document media frontmatter, check and approval behavior; verify examples cover an accessible attachment.

## 3. Destination delivery

- [ ] 3.1 Implement read-only media preflight before writes and Mastodon instance limits, descriptions and asynchronous video polling; verify limit and pending-to-ready/error paths with adapter tests.
- [ ] 3.2 Implement Bluesky image embeds and video VTT captions; verify four-image and 2 MB boundaries, card replacement and captions with adapter tests.
- [ ] 3.3 Pass LinkedIn image data and alt text to Crosspost and hand off PDF carousels; verify API arguments and manual PDF handling with tests.
- [ ] 3.4 Support DEV hosted cover and inline URLs, Gist SVG/text restrictions, and attachment paths in handoffs; verify supported and rejected formats and output with adapter tests.
- [ ] 3.5 Document supported destination media, limitations and manual handoffs; verify the destination matrix matches adapter tests.
