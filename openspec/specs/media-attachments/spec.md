# media-attachments Specification

## Purpose

Allow campaign authors to review and deliver accessible media safely with each destination's supported publishing mode.

## Requirements

### Requirement: Draft media metadata
Draft frontmatter SHALL accept `media` entries with `path`, `alt`, and `kind` for campaign-local attachments.

#### Scenario: Draft declares an image
- **WHEN** a draft declares a media entry with its path, alt text and image kind
- **THEN** the attachment is associated with that destination's draft

### Requirement: Media validation
`mblast check` SHALL report errors for missing media files, missing alt text, and media exceeding the applicable destination size limits.

#### Scenario: Missing attachment
- **WHEN** a draft references a nonexistent media file
- **THEN** check reports the destination and path and exits nonzero

#### Scenario: Invalid attachment
- **WHEN** a media entry has empty alt text or exceeds its destination size limit
- **THEN** check reports the error and exits nonzero

### Requirement: Media approval integrity
The approval hash SHALL include hashes of attached media contents so changing an attachment invalidates approval.

#### Scenario: Media changes after approval
- **WHEN** an approved attachment's bytes change without a draft edit
- **THEN** publishing refuses the draft until it is approved again

### Requirement: Media review at approval
`mblast approve` SHALL list attachment paths and alt text and open previews before asking for approval.

#### Scenario: Reviewing attachments
- **WHEN** a draft with media is presented for approval
- **THEN** the user sees each path and alt text and its preview is opened

### Requirement: Media preflight before upload
Publishing SHALL validate media before any upload or post write, including destination limits available from the service.

#### Scenario: Invalid media preflight
- **WHEN** preflight detects an attachment exceeds an applicable limit
- **THEN** publishing reports the failure without uploading media or creating a post

### Requirement: Bluesky image delivery
Bluesky SHALL upload up to four images of at most 2 MB each and use the image embed instead of an external link card.

#### Scenario: Images and link
- **WHEN** a Bluesky draft contains images and a URL
- **THEN** the post includes the images and does not include an external link card

### Requirement: Bluesky video captions
Bluesky SHALL deliver video with its VTT captions as caption attachments.

#### Scenario: Captioned video
- **WHEN** a Bluesky draft includes a video and VTT captions
- **THEN** the published video embed includes the VTT captions

### Requirement: Mastodon media delivery
Mastodon SHALL upload media with its alt text as the media description and wait for asynchronous video processing before posting.

#### Scenario: Asynchronous video
- **WHEN** Mastodon returns an asynchronous response for a video upload
- **THEN** publishing polls until the media is ready before creating the post

### Requirement: Mastodon instance media limits
Mastodon preflight SHALL read instance media attachment limits from `/api/v2/instance` and apply them before uploading.

#### Scenario: Instance rejects size
- **WHEN** a media file exceeds the instance's reported size limit
- **THEN** preflight fails before any media upload

### Requirement: LinkedIn image delivery
LinkedIn API publishing SHALL pass images and their alt text through Crosspost's `images` option.

#### Scenario: LinkedIn images
- **WHEN** an API-mode LinkedIn draft contains images
- **THEN** Crosspost receives their data and alt text in `images`

### Requirement: LinkedIn PDF handoff
LinkedIn PDF carousels SHALL be handed off for manual attachment rather than uploaded through the API.

#### Scenario: PDF carousel
- **WHEN** a LinkedIn draft includes a PDF carousel
- **THEN** the handoff identifies the PDF for manual attachment

### Requirement: DEV hosted images
DEV publishing SHALL use `devto.coverUrl` as its cover image URL and SHALL use hosted URLs for inline images rather than uploading local images.

#### Scenario: DEV cover
- **WHEN** `devto.coverUrl` is configured
- **THEN** the DEV article uses that hosted URL as its cover

### Requirement: Gist supported attachments
Gist SHALL accept only SVG and text attachments, and SHALL reject binary media rather than attempt to upload it as text.

#### Scenario: Binary Gist attachment
- **WHEN** a Gist draft references a binary image
- **THEN** the draft fails validation before publishing

### Requirement: Manual media handoff
Handoff output SHALL list the files a person must attach manually.

#### Scenario: Handoff with media
- **WHEN** a destination uses handoff mode with attachments
- **THEN** its handoff lists the attachment paths
