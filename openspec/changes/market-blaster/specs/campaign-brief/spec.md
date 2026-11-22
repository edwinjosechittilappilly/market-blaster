# Spec Delta

## Purpose

Captures what actually shipped, from the repository's own history and code, so every post can be traced back to
anchored evidence.

## ADDED Requirements

### Requirement: Brief from a git range
`mblast brief <slug> --range <A..B>` SHALL write `<campaignsDir>/<slug>/brief.md` with the repository remote URL, the
commit subjects and bodies, and the diff stat, each section headed by an evidence anchor (`[E1]`, `[E2]`, ...).

#### Scenario: Range given
- **WHEN** `mblast brief search --range v1.0..HEAD` runs in a git repo
- **THEN** the brief lists every commit in the range under a `Commits` section and the diff stat under `Changed files`

#### Scenario: Not a git repository
- **WHEN** the command runs outside a git repo
- **THEN** it exits 1 with a message saying a git repository is required

### Requirement: Bounded diff hunks for showcase files
The brief SHALL include diff hunks for changed README, docs, examples, tests and package entry files, each file under
its own anchor, capped at 400 diff lines in total with a note when truncated.

#### Scenario: README changed
- **WHEN** the range changes `README.md`
- **THEN** the brief has an anchored section with the README diff

#### Scenario: Large diff
- **WHEN** the selected hunks exceed 400 lines
- **THEN** the brief contains at most 400 diff lines and says how many were omitted

### Requirement: Optional PR and changelog evidence
With `--pr <n>` the brief SHALL include the PR title, URL and body from `gh`; with `--version <v>` it SHALL include the
matching `CHANGELOG.md` section. A failure to read either SHALL produce a warning, not an error.

#### Scenario: gh unavailable
- **WHEN** `--pr 42` is passed and `gh` fails
- **THEN** the brief is written without that section and a warning names the failure

### Requirement: Brief is editable and not overwritten
The brief SHALL end with a `Notes from the author` section for hand-written context. Rerunning `brief` for an existing
slug SHALL NOT overwrite it unless `--force` is given.

#### Scenario: Rerun without force
- **WHEN** the brief exists and `mblast brief <slug> --range ...` runs again
- **THEN** the file is unchanged and the command exits 1 suggesting `--force`
