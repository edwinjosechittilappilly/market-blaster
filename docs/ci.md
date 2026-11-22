# Checking campaigns in CI

CI can validate committed campaign drafts without publishing. Approval requires an interactive terminal; a person should review and approve drafts before publishing. `mblast check --strict` fails on warnings as well as errors, including grounding warnings, so review findings rather than blindly suppressing them.

For campaigns stored in the project under the default `campaigns/` directory, a GitHub Actions workflow can check each campaign with a brief:

```yaml
name: Campaign check
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: edwinjosechittilappilly/market-blaster
          path: .mblast
      - uses: actions/checkout@v4
        with:
          path: app
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: cd .mblast && npm ci && npm link
      - name: Check campaigns
        working-directory: app
        shell: bash
        run: |
          for d in campaigns/*/; do
            [ -f "${d}brief.md" ] || continue
            mblast check "$(basename "$d")" --strict || exit $?
          done
```

Adjust the path if `campaignsDir` differs. Campaigns outside the checkout are unavailable to this job unless explicitly provided; do not expose private pre-launch drafts merely to run CI. If the tool repository is private, supply an appropriately scoped checkout token. This example needs no publishing credentials and sends no posts.
