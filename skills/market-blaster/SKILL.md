---
name: market-blaster
description: Turns a shipped feature brief into grounded, destination-specific drafts. Use when drafting a developer launch campaign.
---

# Market blaster

Use only facts in the supplied brief and brand config. Cite brief evidence anchors in each draft's `evidence` list. Never invent numbers, users, benchmarks, capabilities, or examples. Distinguish shipped changes from plans and limitations. Tell a developer-native story: problem → change → how to try it. Use a direct, specific voice; avoid hype such as revolutionary, game-changing, groundbreaking, seamless, unlock, supercharge, and unleash. Use one primary link. Respect community rules and avoid promotional spam.

Use `{{url:<dest>}}` only for enabled destinations earlier in the supplied publish order, with canonical home first. Do not infer a URL for a later destination. Skip gist and hn unless the brief has a runnable example: leave existing files untouched, do not write those drafts, and explain the omission in your report.

## Draft format

Write only requested paths. Each file is Markdown with YAML frontmatter followed by a body:

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

`destination` and non-empty `evidence` are required; `title` is required as specified below. `tags` and `canonical` are optional; include canonical only when it points to an earlier destination or a supplied canonical URL. Use actual anchors from the brief, not the examples.

## devto

Write a practical Markdown article with usage and tradeoffs. Body limit not specified; title required, at most 128 characters. Frontmatter: `destination: devto`, `title: "Title"`, `evidence: [E1]`.

## hashnode

Write a technical Markdown article with an example and context. Body limit not specified; title required, at most 250 characters. Frontmatter: `destination: hashnode`, `title: "Title"`, `evidence: [E1]`.

## gist

Write a runnable example and minimal instructions only if supported by the brief. Size limit varies; title required. Frontmatter: `destination: gist`, `title: "Title"`, `evidence: [E1]`.

## bluesky

Write a concise standalone post; at most 300 graphemes. Title optional. Frontmatter: `destination: bluesky`, `evidence: [E1]`.

## mastodon

Write a conversational standalone post; default 500 characters, subject to the configured instance limit. Title optional. Frontmatter: `destination: mastodon`, `evidence: [E1]`.

## linkedin

Write a practical professional update with a concrete developer outcome; at most 3000 characters. Title optional. Frontmatter: `destination: linkedin`, `evidence: [E1]`.

## x

Write a concise standalone post; at most 280 weighted characters. Title optional. Frontmatter: `destination: x`, `evidence: [E1]`.

## hn

Write a factual Show HN submission only if the brief contains a runnable example. Body limit not specified; title required, at most 80 characters. Frontmatter: `destination: hn`, `title: "Title"`, `evidence: [E1]`.

## reddit

Write a useful subreddit-appropriate self-post, respecting community rules. Body limit not specified; title required, at most 300 characters. Frontmatter: `destination: reddit`, `title: "Title"`, `evidence: [E1]`.

## threads

Write a conversational standalone post; at most 500 characters. Title optional. Frontmatter: `destination: threads`, `evidence: [E1]`.

## medium

Write a readable Markdown article with technical context. Body limit not specified; title optional. Frontmatter: `destination: medium`, `evidence: [E1]`.

## producthunt

Write a concise launch description explaining the problem, change, and how to try it. Limit not specified; title optional. Frontmatter: `destination: producthunt`, `evidence: [E1]`.

## substack

Write a reader-focused newsletter note with technical substance. Body limit not specified; title required. Frontmatter: `destination: substack`, `title: "Title"`, `evidence: [E1]`.

## Checklist

- Every claim is grounded and every evidence anchor exists in the brief.
- Each requested draft follows its destination's shape and limits; skipped gist/hn drafts are reported.
- Run `mblast check <slug>` and address errors; report warnings and omissions.
