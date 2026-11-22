# Announce a feature

Run these commands from the configured project. Replace the slug, Git range, pull request, and version with your own.

## Collect evidence and draft

```bash
mblast new search-filters --range v1.3.0..HEAD --pr 42 --version 1.4.0
```

`new` runs `brief`, `draft`, and `check` in sequence. The brief contains anchored evidence from commits, diff statistics and selected file diffs, plus PR and changelog information when available. Selected diffs are limited to 400 lines. Drafts are written under `campaigns/search-filters/drafts/`, or the configured `campaignsDir`.

To add context before drafting, run the steps separately:

```bash
mblast brief search-filters --range v1.3.0..HEAD --pr 42 --version 1.4.0
# Edit campaigns/search-filters/brief.md, including Notes from the author.
mblast draft search-filters
mblast check search-filters
```

`draft` preserves existing files unless passed `--force`, which replaces the enabled drafts. `brief --force` overwrites the brief, including author notes. You can instead ask an interactive agent to use the market-blaster skill for the campaign.

The drafting agent runs as your user. Its temporary workspace and filtered environment are not a security sandbox; use a suitable sandbox supported by your agent if needed.

## Import a Blast Studio campaign

Export a campaign in Blast Studio, then import the resulting archive from your configured project:

```bash
bstudio export my-feature
mblast import my-feature.campaign.zip
```

Use `--slug another-name` to choose a different campaign directory. Enabled destinations in the package become drafts;
enabled destinations absent from the package receive a skip. The summary lists destinations that are not enabled and
the `market-blaster.yml` entries to add, as well as manual platforms. The brief, sources, media, handoffs and review
artifacts are copied into the campaign. Import runs `check` after writing. Existing approved drafts are protected;
`--force` replaces them and clears their approvals. Version 1 Studio export directories also remain supported:
`mblast import path/to/export-directory`.

## Review and approve

Edit the Markdown drafts yourself. Frontmatter identifies the destination and evidence anchors; some destinations require a title. `{{url:devto}}` refers to the published DEV URL and is resolved during publishing. Review claims and links, not just validation output.

```bash
mblast check search-filters
mblast check search-filters --strict
mblast approve search-filters
```

Check reports errors for issues such as missing evidence, invalid anchors, length limits and links to destinations that do not publish earlier. It warns about numbers and code identifiers not found in the brief. Strict mode also fails on warnings. Approval requires an interactive terminal and records a hash of the draft and relevant configuration. Editing either can require approval again. Use `--only devto,bluesky` to approve selected destinations.

## Preview and publish

```bash
mblast publish search-filters
mblast publish search-filters --stage --yes
mblast publish search-filters --yes
mblast status search-filters
```

The first command is a dry run and sends nothing. Staging is optional: it writes unpublished DEV and Hashnode drafts for preview. The final command performs real writes and prepares handoffs. With the starter `devto.publish: false`, an initial DEV create is staged even without `--stage`; a subsequent publish updates it as published.

Before writes, publishing checks drafts and verifies eligible API destinations where a read check is available. Lengths are checked conservatively; dependencies are resolved as earlier destinations publish, and a missing dependency blocks that destination. The canonical home comes first, followed by other articles, social destinations and handoffs. Publishing can partially succeed; inspect status before retrying. Use `--only devto,bluesky` to select destinations.

See [Handoffs](handoffs.md) for manual submissions and [Recovery](recovery.md) for failures and uncertain outcomes.
