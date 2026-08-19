# Field Archive — Static Site Generator
### Project brief for Claude Code

## What this is

Maker Project Lab is cataloging Barcelona street infrastructure objects (poles, utility boxes, lights, benches) as **Specimens** in Airtable, with **Concepts** — redesign/augmentation ideas — branching off each specimen, similar to branches in a git repo. Capture happens in Airtable (mobile forms, in the field). This project builds the **publish layer**: a static site generator that turns the Airtable data into a public site on GitHub Pages, styled to match an existing print-oriented visual identity.

Two reference files are attached alongside this brief — read both before starting:
- `concept-sheet-template.html` — the printable A4 concept sheet, defines the core visual language
- `field-archive-site-preview.html` — a hand-built mockup of a specimen page using real data, shows how that language extends to the web

## Data source: Airtable

- **Base:** "Maker Project Lab - BCN Designs" — base ID `app0RuO42lb4FLov0`
- **Specimens table** — ID `tbl8kUsFvFztzd1PD`. Primary field is `Name` (fixed from the default autonumber so linked-record references display correctly — this matters if you're inspecting the schema programmatically, don't assume the first field is the ID).
  - Specimen ID (autonumber), Specimen Code (formula, `SPC-001` format), Name, Neighborhood, Date Spotted, Photos (multiple attachments), Measurements, Existing Materials, Notes, Concepts (linked records → Concepts table)
  - Note: a `Category` single-select field was deleted by the user — don't assume it exists
- **Concepts table** — ID `tblYFySOs7CHxNIxA`. Primary field is `Concept Code` (formula, `CON-001` format, fixed via `"CON-" & RIGHT("000" & {Id}, 3)`).
  - Concept ID (autonumber), Concept Code, Specimen (linked record → Specimens, single-link), Concept Art (attachment), Idea, Challenge, Blocks, Materials, Specialists
  - Note: a `Concept` field was deleted (merged into `Idea`) — don't assume it exists
- Both tables have a few leftover fields (`Photo Tags`, `Maintenance Score` on Specimens; `Feasibility Score` on Concepts) that may or may not still exist by the time you look — check the live schema rather than trusting this list, the user has been actively pruning fields.

**Access:** The user will need to generate an Airtable Personal Access Token scoped to read-only access on this base (`data.records:read` and `schema.bases:read`), store it as a GitHub Actions secret (e.g. `AIRTABLE_TOKEN`), and never commit it to the repo. Do not ask the user to paste the token into chat — have them add it directly as a repo secret in GitHub's settings.

## Design system (carry over exactly, don't reinterpret)

- **Palette:** paper `#EFEAE1`, paper-deep `#E6E0D4`, ink `#1C1F22`, steel `#3A4750`, steel-soft `#8B96A0`, signal yellow `#F2B705`, brick `#B5502F`
- **Type:** Fraunces (italic, serif — names/headlines), IBM Plex Mono (labels, IDs, metadata, all-caps tracked), Inter (body text)
- **Motifs:** crop-mark corners, a hexagon "panot tile" stamp (referencing Barcelona's sidewalk tile), dashed-line field labels (`lbl-tag` chips in steel/brick/signal), a dashed leader-line connecting a specimen to its branched concepts

## What to build

1. **A build script** (language/framework your choice — Node is a reasonable default given the user's existing JS/PICO-8/web tooling) that:
   - Authenticates to Airtable with the token above
   - Fetches all Specimens and all Concepts
   - For each Specimen, generates a detail page: hero photo, name, metadata fields, and a card for every linked Concept (reuse the layout/CSS from `field-archive-site-preview.html`)
   - Generates an archive index page: a gallery of all Specimens (this doesn't exist as a real template yet — design it as a grid of specimen cards, photo-first, linking to each detail page)
   - **Downloads every attachment (Photos, Concept Art) into the repo** (e.g. `/assets/images/`) rather than linking Airtable's own attachment URLs — those URLs are signed and expire after a few hours, so linking them directly will produce broken images shortly after each build. Cache/skip re-downloading files that haven't changed.
   - Writes static HTML (or a static-site-framework output — again, your call) into a `docs/` or `dist/` folder suitable for GitHub Pages

2. **A regeneration trigger**, both of:
   - `workflow_dispatch` — a manual "Run now" button in the GitHub Actions tab, for right after the user adds something and wants to see it live immediately
   - A nightly `schedule` trigger, so the site catches up automatically even if the user never manually triggers it
   - (Not required for v1, but worth architecting so it's addable later: an Airtable Automation on record create/update calling a `repository_dispatch` webhook, for near-real-time publishing instead of a nightly lag)

3. **GitHub Pages deployment** — commit the generated static files and configure Pages to serve them (or use the GitHub Pages Actions deployment flow instead of committing build output directly, whichever is cleaner given the chosen framework).

## Explicitly out of scope for v1

- No auth/login, no editing from the site itself — Airtable remains the only place data is entered
- No handling of the pruned/leftover Airtable fields — read the live schema, don't hardcode assumptions from this doc where it might drift
- No requirement to support a `Category` field or similar taxonomy — it was intentionally removed

## Open questions to raise with the user before/during the build

- Static site framework preference, if any (or plain HTML generation is fine)
- Whether the archive index should paginate/filter once specimen count grows, or a flat grid is fine for now
- Whether "coming soon" / empty states are needed for a Specimen with zero Concepts yet
