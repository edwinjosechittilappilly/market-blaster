# Spec Delta

## Purpose

Turns a brief and the brand config into one reviewable draft per destination, shaped for that platform's audience and
limits, traceable to evidence, and checked before anything is approved or published.

## ADDED Requirements

### Requirement: Draft file format
Each draft SHALL be `<campaignsDir>/<slug>/drafts/<destination>.md` with YAML frontmatter containing `destination` and
`evidence` (list of brief anchors such as `E1`), plus `title` for devto, hashnode, gist, hn and reddit; optional `tags`
and `canonical`. The body follows the frontmatter.

#### Scenario: Valid long-form draft
- **WHEN** `drafts/devto.md` has `destination: devto`, `title`, `evidence: [E1]` and a body
- **THEN** `mblast check` accepts it

### Requirement: Headless AI drafting without secrets
`mblast draft <slug>` SHALL run `agent.command` once with a prompt containing the skill, brand config and the brief
fenced as untrusted data, in an environment limited to an allowlist that excludes every credential variable, and SHALL
report which enabled destinations have drafts. Existing drafts SHALL be kept unless `--force`.

#### Scenario: Agent writes drafts
- **WHEN** `mblast draft search` runs with a configured agent command
- **THEN** the agent runs once and the command lists present and missing drafts

#### Scenario: Credentials hidden from agent
- **WHEN** `DEV_API_KEY` is set in the shell and `mblast draft` runs
- **THEN** the agent process environment has no `DEV_API_KEY`

#### Scenario: No brief
- **WHEN** the campaign has no `brief.md`
- **THEN** the command exits 1 telling the user to run `mblast brief` first

### Requirement: Skill rules
The `market-blaster` skill SHALL require facts only from the brief or brand config, an `evidence` list per draft, no
invented numbers, users or benchmarks, no gist or hn draft unless the brief has a runnable example, and SHALL give a
section for each supported destination.

#### Scenario: Skill content
- **WHEN** the skill file is read
- **THEN** it states the grounding rule and has a section for every destination id

### Requirement: Check validates drafts
`mblast check <slug>` SHALL report per draft: missing required frontmatter, unknown evidence anchors, length over the
destination limit measured the way that platform counts with each link counted as 100 characters, and links to a
destination not published earlier in the order; it SHALL exit 1 if any draft has an error.

#### Scenario: Too long for Bluesky
- **WHEN** `drafts/bluesky.md` exceeds 300 graphemes once links count as 100 characters
- **THEN** check reports bluesky over the limit with the measured length and exits 1

#### Scenario: Link to a later destination
- **WHEN** `drafts/devto.md` contains `{{url:bluesky}}`
- **THEN** check reports that bluesky publishes after devto

### Requirement: Grounding warnings
`check` SHALL warn for each number, version string or code identifier in backticks found in a draft but not in the
brief, and SHALL exit 1 on warnings only with `--strict`.

#### Scenario: Invented benchmark
- **WHEN** a draft says "3x faster" and "3x" is not in the brief
- **THEN** check warns that `3x` is not in the brief

### Requirement: One command to drafts
`mblast new <slug> --range <A..B>` SHALL run brief, draft and check in sequence and stop at the first failing step.

#### Scenario: Full pipeline
- **WHEN** `mblast new search --range v1..HEAD` runs with a working agent
- **THEN** brief, drafts and a check report exist and the exit code is check's
