# Manual handoffs

A handoff prepares a compose link and material for a person to submit; it does not publish on the destination. After reviewing and approving applicable drafts, run this in an interactive terminal:

```bash
mblast publish search-filters --assist
mblast publish search-filters --assist --only hn,reddit
```

Assist processes unpublished handoff destinations in publishing order, opens their compose pages, and asks for a permalink. Paste the HTTPS permalink after submitting, press Enter to skip, or enter `s` to stop. A skipped destination remains a handoff, not a recorded publication. Assist validates permalink hosts for supported platforms; a custom Substack host requires confirmation. For newsletters, it opens each configured editorial page and records one permalink for the newsletter destination.

Destinations have different AI policies:

- **Draft:** Assist shows and attempts to copy the approved resolved text. Review it and submit manually. Clipboard or browser-opening failures are warnings; use the displayed text and URL instead.
- **Outline:** Reddit, Product Hunt, Lemmy and newsletter handoffs show talking points but copy nothing. Write the submission yourself and follow each community's rules.
- **None:** Hacker News has no generated draft. Assist supplies the canonical article's title and link; write any accompanying text yourself. HN forbids generated text and automated posting. For an external canonical home, set `hn.title`.

Referenced destinations must already be published with URLs. Approve draft and outline destinations before assist; Hacker News does not need a draft approval. `--assist` cannot be combined with `--yes`, `--stage`, `--force`, or `--open`.

Alternatively, `mblast publish search-filters --yes --open` prepares handoffs, opens compose pages, and attempts to copy draft-allowed text. It does not record submissions. Record a manual outcome separately:

```bash
mblast mark search-filters hn --url 'https://news.ycombinator.com/item?id=123'
mblast status search-filters
```

The destination must be enabled. `mark --url` records a URL; it does not submit or verify a post. For uncertain API outcomes, follow [Recovery](recovery.md).
