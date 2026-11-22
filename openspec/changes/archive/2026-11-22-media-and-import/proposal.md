# Proposal

## Why

Blast Studio needs a versioned boundary for delivering reviewed drafts and media to Market Blaster without writing its internal files. Publishing must preserve review and approval safeguards as attachments and their contents change.

## What Changes

- Import Studio manifest v1 into campaigns, preserve review metadata, create explicit skips for unexported enabled destinations, and run Market Blaster checks.
- Add media-aware validation, approval previews and content hashes, and destination-specific uploads or manual handoffs.
- Warn when an imported draft no longer matches its Studio review.
- This change amends the earlier Market Blaster non-goal of **image upload**; supported uploads are now in scope.

## Capabilities

### New Capabilities

- `media-attachments`: Validate, approve and deliver draft media using destination-specific constraints.
- `studio-import`: Import a versioned Studio package into a checked Market Blaster campaign.

### Modified Capabilities

None: there are no archived main specifications; the earlier `market-blaster` change remains unarchived.

## Impact

Draft frontmatter, campaign import, checking, approval hashes, publishing preflight, adapters, handoff output, tests and user documentation change. Existing publishing safety and manual approval remain in force; thread posting and media hosting are out of scope.
