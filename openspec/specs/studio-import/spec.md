# studio-import Specification

## Purpose

Bring a reviewed Blast Studio package into a Market Blaster campaign through a versioned, checked import boundary.

## Requirements

### Requirement: Versioned Studio import
`mblast import <dir>` SHALL read a Blast Studio manifest v1 and write its exported drafts to the campaign identified by the package.

#### Scenario: Import a package
- **WHEN** a valid manifest v1 package is imported
- **THEN** its exported destination drafts are written into the campaign

#### Scenario: Unsupported manifest
- **WHEN** the manifest version is not supported
- **THEN** import fails without importing drafts

### Requirement: Explicit skips for unexported destinations
Import SHALL write `skip: not planned in studio` drafts for enabled destinations not exported by Studio.

#### Scenario: Partial package
- **WHEN** an enabled destination is absent from the manifest
- **THEN** its draft records `skip: not planned in studio`

### Requirement: Copy imported media
Import SHALL copy package media into the campaign and write draft references to those campaign-local copies.

#### Scenario: Package contains media
- **WHEN** an exported draft references package media
- **THEN** the imported draft references a copy in the campaign

### Requirement: Preserve approved drafts
Import SHALL refuse to overwrite any approved draft unless `--force` is supplied.

#### Scenario: Approved destination exists
- **WHEN** import would overwrite an approved draft without `--force`
- **THEN** import refuses the overwrite and leaves that draft unchanged

#### Scenario: Forced replacement
- **WHEN** import would overwrite an approved draft and `--force` is supplied
- **THEN** import may replace it and the replacement requires approval before publishing

### Requirement: Check imported campaigns
After importing, `mblast import` SHALL run Market Blaster's campaign check and report its result.

#### Scenario: Imported draft fails check
- **WHEN** a successfully imported draft violates a Market Blaster check
- **THEN** import reports the check failure and exits nonzero

### Requirement: Threads are manual handoffs
Import SHALL retain exported threads as handoff text files and SHALL NOT post them as reply chains.

#### Scenario: Thread exported
- **WHEN** a package contains a thread
- **THEN** import provides its text as a manual handoff file without posting the thread

### Requirement: Stale Studio review warning
Import SHALL retain `studio.reviewHash` and `studio.verdict`; `mblast check` SHALL warn when the current draft hash differs from `studio.reviewHash`.

#### Scenario: Draft edited after review
- **WHEN** an imported draft changes after its Studio review
- **THEN** check warns that the Studio review is stale
