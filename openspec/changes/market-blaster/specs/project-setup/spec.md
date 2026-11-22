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

### Requirement: Credentials come from the shell, project .env or the macOS Keychain
The system SHALL resolve each credential from, in order, the shell environment, the project `.env`, and the macOS
Keychain (service `market-blaster`), only for `doctor`, `auth list` and `publish`. Credentials SHALL NOT appear in
drafts, state or output.

#### Scenario: Value in several places
- **WHEN** `DEV_API_KEY` is set in the shell, in `.env` and in the Keychain
- **THEN** the shell value is used, and without the shell value the `.env` value is used

#### Scenario: Keychain only
- **WHEN** `DEV_API_KEY` exists only in the Keychain
- **THEN** `doctor` reports devto `api` with source `keychain`

### Requirement: Auth commands
`mblast auth set <KEY>` SHALL store a known credential in the Keychain from hidden input or `--stdin`; `mblast auth
list` SHALL show each known key's source without its value; `mblast auth linkedin` SHALL run LinkedIn's
authorization-code flow through a `http://localhost:8723/callback` loopback, verify `state`, and store the access
token and its issue date.

#### Scenario: Unknown key
- **WHEN** `mblast auth set FOO` runs
- **THEN** it exits 1 and lists the known keys

#### Scenario: LinkedIn token ageing
- **WHEN** the stored LinkedIn token was issued 51 days ago
- **THEN** `doctor` warns to run `mblast auth linkedin`

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
