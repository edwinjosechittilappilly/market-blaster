# Design

## Context

See [the approved Blast Studio design](../../../../blast-studio/docs/design/blast-studio.md), especially Platform to Market Blaster mapping and Market Blaster changes. Existing Market Blaster drafts, checks and approval state are defined by the unarchived `market-blaster` change. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:** Preserve Market Blaster's check and approval boundaries for imported content and media.

**Non-Goals:** Automated thread posting, LinkedIn document upload, media hosting and unsupported platform integrations.

## Decisions

- Import owns translation from the shared manifest v1 into campaign files; Studio does not write Market Blaster internals. Define and test the exact manifest and review-hash canonicalization jointly with Studio so both sides compute the same value. The review hash is distinct from the Market Blaster approval hash.
- Check the full intended import against approved state before replacing drafts; forced replacement must not retain an approval valid for different content. Copy package media into the campaign, keeping references campaign-local.
- Include content hashes of media in approval hashing, and show paths and alt text with previews during interactive approval. Use the platform's available preview opener (the review proposes `qlmanage -p` on macOS).
- Complete read-only media preflight for all selected posts before any upload or post write. Mastodon fetches instance media limits and polls asynchronous video processing. Preserve existing publishing state and unknown-outcome safeguards for write failures.
- Bluesky image embeds replace external cards; videos carry VTT captions. LinkedIn images use Crosspost, while PDF carousels are manual handoffs. DEV uses hosted URLs; Gist accepts SVG and text only. Handoffs name attachment files.
- Threads remain text-file handoffs, not automated reply chains. Studio's review metadata is retained and stale review warnings do not replace Market Blaster's own checks or approval.

## Risks / Trade-offs

- Platform limits and upload behavior change; service-reported Mastodon limits are checked at preflight and fixed Bluesky limits are covered by adapter tests.
- Studio and Market Blaster must agree on manifest fields and review hash bytes; shared fixtures prevent silent mismatch. Media and post uploads are separate writes and failures must not be mistaken for a completed post.
