# Spec Delta

## Purpose

Lets a developer add Market Blaster to any project with one config file and credentials from the environment, see
which destinations will publish and which will hand off, and install the drafting skill once per machine.

## ADDED Requirements

### Requirement: Init writes a starter config
`mblast init` SHALL create `market-blaster.yml` with brand fields, default destinations, `canonicalHome` and
`campaignsDir`, and `.env.example` listing every credential variable, and SHALL add `.env` to `.gitignore`. It SHALL
NOT overwrite an existing `market-blaster.yml`.

#### Scenario: Fresh project
- **WHEN** `mblast init` runs in a directory without `market-blaster.yml`
- **THEN** `market-blaster.yml` and `.env.example` exist and `.gitignore` contains `.env`

#### Scenario: Existing config
- **WHEN** `mblast init` runs and `market-blaster.yml` already exists
- **THEN** the file is unchanged and the command says it was kept

### Requirement: Credentials come only from the environment
The system SHALL read credentials from environment variables, loading `.env` from the project root for `doctor` and
`publish` only, with shell values taking precedence. Credentials SHALL NOT appear in drafts, state or output.

#### Scenario: Value in both places
- **WHEN** `DEV_API_KEY` is set in the shell and in `.env`
- **THEN** the shell value is used

#### Scenario: Secrets never echoed
- **WHEN** a publish fails with an API error
- **THEN** neither the output nor `state.json` contains any credential value

### Requirement: Doctor reports destination readiness
`mblast doctor` SHALL list each configured destination as `api`, `handoff` or `missing`, naming missing variables;
with `--online` it SHALL perform one authenticated read per `api` destination and report `ok` or the error.

#### Scenario: Partially configured
- **WHEN** `DEV_API_KEY` is set and X has no credentials
- **THEN** doctor shows devto `api` and x `handoff` with the missing X variable names

### Requirement: Invalid config fails clearly
The system SHALL reject a config that names an unknown destination, lacks `brand.name`, or sets `canonicalHome` to a
destination that is not long-form, exiting 1 and naming the field.

#### Scenario: Unknown destination
- **WHEN** `destinations` includes `myspace`
- **THEN** the command exits 1 and names `myspace` as unknown

### Requirement: Skill installation
`mblast install-skill` SHALL symlink the repository's `skills/market-blaster` into `~/.agents/skills` and
`~/.claude/skills`, replacing only an existing symlink and never a real directory.

#### Scenario: Existing real directory
- **WHEN** `~/.claude/skills/market-blaster` is a real directory
- **THEN** it is left untouched and the command reports it
