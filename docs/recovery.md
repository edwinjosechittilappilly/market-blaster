# Recovery

Start with `mblast status search-filters` and inspect the destination and its error. Campaign `state.json` records outcomes and redacted errors. Preserve it to avoid duplicate posts.

| Outcome | Action |
|---|---|
| `failed` | Fix the reported cause and run `mblast publish search-filters --yes` again. Already published unchanged destinations are skipped. |
| `unknown` or `pending` | The write may have succeeded. Check the platform before retrying. Resolve it with `mark` as described below. |
| `blocked` | Publish or fix the destination supplying the missing link, then retry. |
| `refused: draft is not approved or has changed` | Review the draft and relevant configuration, then run `mblast approve search-filters` again. |
| Prior handoff, now API mode | Record the manual outcome if submitted. Otherwise, `--force` permits an API attempt; first ensure it will not duplicate a manual post. |

For an uncertain outcome, inspect the destination itself. If the post exists, record its URL; if it does not, clear the uncertain attempt before retrying:

```bash
mblast mark search-filters bluesky --url https://bsky.app/profile/example/post/example
# Alternatively, only after confirming no post was created:
mblast mark search-filters bluesky --not-posted
mblast publish search-filters --yes
```

`--not-posted` is accepted only for an unknown or pending outcome, including an unknown update attempt. For an uncertain update to an existing article, it retains the earlier published or staged record so the update can be retried. `mark --url` records an outcome; it does not verify it.

Changed articles with a stored ID can be approved and published again to update in place. Changed social posts require `--force` and create a new post; check for duplicates before using it. Staged DEV and Hashnode articles can be previewed before a subsequent publish. See [Announce a feature](announce.md) for the normal workflow.
