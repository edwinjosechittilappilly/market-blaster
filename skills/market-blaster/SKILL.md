---
name: market-blaster
description: Turns a shipped feature brief into grounded, destination-specific drafts. Use when drafting a developer launch campaign.
---

# Market blaster

Use only facts in brief.md and brand.yml. Cite actual `## [E<n>]` brief headings in each draft's evidence. Never invent numbers, users, benchmarks, capabilities, or examples; distinguish shipped changes from plans and limitations. Tell a developer-native story: problem, change, how to try it. Avoid hype and respect community rules.

Draft the canonical home first. Social posts link to it with `{{url:<home>}}` when the home is an enabled destination; use the supplied URL for an external home. Only link to enabled destinations earlier in the supplied publish order. Use one primary link.

## AI policy

- HN: never write generated HN text or a draft file. The human submits the canonical article.
- Reddit and Product Hunt: write only bullet talking points, not a post. Suggest subreddit fit for Reddit and remind the human to disclose self-promotion and check community rules. The human writes the post.
- Other destinations: write a first draft for human review. Gist requires a runnable example supported by the brief; otherwise write a skip file.

## Draft format

Write only requested paths under `drafts/`. Use Markdown with YAML frontmatter:

```markdown
---
destination: devto
title: "A specific title"
evidence: [E1, E2]
tags: [typescript]
canonical: "{{url:hashnode}}"
---

The draft body.
```

Use a destination matching the filename and non-empty evidence. Include a title where required. Tags and canonical are optional. Use real evidence anchors rather than the examples.

## How to write a skip file

When a destination is inappropriate, write its requested file with a reason; no title, evidence, or body is required:

```markdown
---
destination: gist
skip: "No runnable example in the brief"
---
```

## Reach

- LinkedIn: put the concrete outcome in the first two lines, link at the end, use at most three hashtags, and never say "excited to announce".
- X and Bluesky: use a concrete hook plus code or before/after, and one link.
- Mastodon: use accessible CamelCase hashtags.
- DEV: use a tutorial structure with code and relevant tags.
- Follow the per-destination guidance in the reference below when available.

## Checklist

- Claims and evidence are grounded in the brief; no invented facts.
- Every requested file has valid frontmatter and matches its destination; use a skip file with a reason where appropriate.
- HN has no draft; Reddit and Product Hunt contain talking points only.
- Respect destination limits and link order; report omissions and uncertainties.
