# VoiceVote — Draft Science Fair Roster Integrity Review

**Review date:** 5 November 2026  
**Source:** The user-provided `SCIENCE FAIR 2026-27 EVS & SCIENCE fair details teachers hand0ut.xlsx`.  
**Handling:** Read-only extraction. **No student names included here; no production Google Sheets catalog or feedback was changed.** This is an incomplete planning handout, not an organizer-approved voting roster.

## Source observations

| Check | Preliminary result |
| --- | ---: |
| Detail class/section tabs | 45 |
| Separate summary-sheet section entries | 53 |
| Nonempty project-title cells in detail tabs | 381 |
| Project counts recorded in the summary | 429 |
| Detail sections with mismatches against a matched summary count | 33 |
| Detail sections with no extracted title cells | 5 |
| Title-identity duplicate groups within one class/section | 11 |
| Summary sections with no exact normalized tab match | 16 |
| Detail tabs bearing a 2025–26 session header | 20 |
| Class 10 projects counted in summary, with no separate matching detail tabs provided | 54 |

These counts reflect **nonempty project-title cells**, not a verified count of independent teams. A repeated title might represent another team, a duplicate entry, or an outdated draft. Count disagreements may also reflect incomplete or differently labeled tabs. No attempt was made to invent project names, identify students or correct the school’s records.

The two currently published VoiceVote entries (Class 6 / Heidelberg / XenoChat and Class 9 / Keats / VoiceVote) match the live Google `Projects` Sheet exactly but were **not found in the matching source-handout detail tabs**. Their status as demonstration entries versus confirmed fair participants must be decided by the organizer. Do not silently replace them or mark them inactive.

## Why this matters to app correctness

VoiceVote currently uses a composite project identifier: **Class + Section + Project Title**. It does not have a unique immutable stall/project ID.

- Two distinct teams with an identical title in the same class and section cannot be differentiated in dropdowns, voting records, or private rankings.
- Capitalization, Unicode-width or spacing variants can create superficially different catalog entries that visitors may misselect.
- Changing a project name after feedback exists can split existing rankings, since historical feedback stores the original strings.
- The public `projects.json` is automatically synchronized from the live Apps Script catalog. It must not silently overwrite a last-known-good snapshot when prospective catalog rows are ambiguous.

The `scripts/catalog-integrity.mjs` validator and `scripts/sync-projects.mjs` now **reject duplicate normalized (class, section, title) identities** before publishing a new snapshot. This protection does not infer whether two teams are the same. **Organizers must approve distinct titles or stable project IDs first.**

**Limitation:** The backend `readProjectCatalog_` currently drops *exact* duplicate rows before exposing the catalog API. The snapshot validator cannot detect exact duplicate underlying Sheet rows if the server already omitted them. Use the private teacher-source review and organizer cleanup before loading the full roster. Production data has not yet been migrated to stable project IDs.

## Validation and acceptance rules for the final roster

1. A single approved `Projects` Sheet must contain `Class/Grade`, `Section`, `Project Name`, and `Active`. Define whether class 10 participates, and supply missing verified titles.
2. Every active project must have a nonempty Class, Section and Title with unambiguous identity; same-title teams in one section require a school-approved disambiguation.
3. Confirm the final session/year for every section; 2025–26-labeled tabs must not be imported automatically into the 2026–27 fair.
4. Agree the expected count by class/section and resolve all unmatched/mismatched source counts.
5. Freeze the roster before voting begins. Any later rename must include a migration policy for existing feedback/rankings.
6. First stage the approved roster in a **separate** test data set, test project search/dropdowns at the anticipated fair size, and reconcile counts. Only then plan an explicitly authorized production import.
7. Keep the existing common QR URL, feedback rows and visitor-pass preparation mode unchanged.

## Current automated safeguards

- **Server:** validates the posted project against the active `Projects` Sheet; fabricated or inactive selections are rejected.
- **Public app:** dependent Class → Section → Project dropdowns and global search, including projects of the same name across **different** sections.
- **Snapshot sync:** rejects malformed fields, names the server would not accept, and duplicate identities differing only in case, whitespace or Unicode compatibility; a rejected sync does **not** replace `projects.json`.
- **Browser smoke tests:** use isolated contexts, synthetic receipt state, and no real feedback submissions. The legacy hosted-search smoke has been updated to respect deferred visitor passes.

## Private artifact

A sanitized, student-name-free workbook named `VoiceVote_Roster_Integrity_Review_2026-27.xlsx` is available as a **conversation attachment**, not in public GitHub. It contains the draft title list with source coordinates, section count discrepancies, duplicate groups and unmatched summary entries.

**Next constructive step:** Obtain one organizer-approved canonical roster and disambiguation decisions, then validate it in a separate test catalog before any production Sheet change.
