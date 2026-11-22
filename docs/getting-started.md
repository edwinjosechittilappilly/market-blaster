# Getting started

Market Blaster collects evidence from a Git repository, drafts posts, and publishes or hands them off after review. See [Announce a feature](announce.md) for the campaign workflow.

## Install

You need Node.js 22.18 or newer and Git. The GitHub CLI (`gh`) is optional; it can provide pull request evidence and a Gist token.

```bash
npm install -g market-blaster
mblast install-skill
```

Alternatively, clone and link the tool:

```bash
git clone https://github.com/edwinjosechittilappilly/market-blaster.git ~/Documents/GitHub/market-blaster
cd ~/Documents/GitHub/market-blaster
npm install
npm link
mblast install-skill
```

`npm link` puts `mblast` on your PATH, pointing to the clone. To update, run `git pull && npm install` in the clone. The link continues to point there.

## Releasing

Bump the version in `package.json` and `package-lock.json`, commit it, then create and push a matching tag:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

The release workflow requires an `NPM_TOKEN` repository secret with permission to publish. It tests and publishes the package with provenance, then creates a GitHub release with the npm tarball. npm Trusted Publishing can replace the token after it is configured for this repository.

## Configure your project

In the Git repository you want to announce, run:

```bash
cd ~/code/my-project
mblast init
```

Edit `market-blaster.yml`: set `brand.name`, `brand.pitch`, `brand.audience`, voice and links; choose your destinations; and set `canonicalHome` to `devto`, `hashnode`, or your own article URL. A destination used as the canonical home must also be enabled. The default drafting command is `[omp, -p]`; set `agent.command` for your installed headless agent.

Campaigns default to `campaigns/` in the project. Drafts committed to a public repository are public before launch; set `campaignsDir` outside the repository if needed. Preserve campaign state: `state.json` records approvals and publication outcomes.

The starter config has `devto.publish: false`, so a first DEV API create produces an unpublished draft. Set it to `true` to publish on the first create, or stage and preview the draft before publishing it on a subsequent run.

## Credentials and readiness

Configure credentials using your shell, project `.env`, or macOS Keychain. Shell variables take precedence over `.env`, which takes precedence over Keychain. `mblast init` creates `.env.example` and adds `.env` to `.gitignore`. On macOS, `mblast auth set DEV_API_KEY` prompts for a hidden value; use `--stdin` to pipe one. `mblast auth list` reports sources, not values.

```bash
mblast doctor
mblast doctor --online
```

Doctor reports API, handoff, and missing modes; `--online` also checks available API connections. See the [credentials section of the guide](guide.md#3-credentials) for platform setup. Then follow [Announce a feature](announce.md).
