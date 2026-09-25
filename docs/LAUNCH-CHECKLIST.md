# Forms-link launch checklist

Prepared 24 September 2026; updated 25 September 2026. Completed implementation items are marked below. Remaining items cover physical phone trials and school handover.

## Current working baseline

- Five Arabic forms: case details, daily brief, teachers/substitutes, late students, daily absence sheet (PDF).
- Local drafts and saved records; manual JSON backup/restore.
- PDF, Word and Excel exports with the approved structured design and official school identity.
- Existing automated model, mobile/export, offline and long-content layout checks have passed for the published release. Physical iPhone and Android checks remain pending.

## Day 1: finish the practical setup

- [x] Confirm a simple profile: supervisor name and grade, remembered on the device.
- [x] Add grade-wide roster selection to relevant student/class fields, retaining manual entry when a student is missing.
- [x] Preserve stable student and record IDs for future integration; retain historical names/classes in saved records.
- [ ] Agree on private roster delivery. Recommended for this deadline: one roster file per grade, imported once during setup and stored on the supervisor's device. Private device-local roster import is implemented; this is not an authentication system.
- [ ] Prepare and verify the actual class/name lists for grades 6, 8 and 9 when supplied. Reuse the existing grade-7 source privately; preserve the previously deferred missing-name entries.
- [x] Keep all real roster files outside the public repo, build and downloadable template directory. A public grade URL or UI selector is not roster protection.
- [x] Ensure roster loading/updating preserves saved records and drafts, and the backup format can restore the new profile/roster without breaking old backups.

## Day 2: small supervised phone trial

- [ ] Use at least one actual iPhone and one Android phone, with approximately three supervisors where available.
- [ ] In the normal browser, complete profile/roster setup and add a home-screen shortcut.
- [ ] Create, save, close, reopen and edit each applicable form; verify Arabic names and classes.
- [ ] Export and open PDF, Word and Excel on the phones; test the phone's share action and inspect one printed report.
- [ ] Download a backup and restore it in an isolated test browser/device. Never clear a colleague's live browser data just to test recovery.
- [ ] Verify what happens without a connection after initial loading, including exports and explicit save failures.
- [ ] Check long names, absent students, missing roster entries, old records and duplicate roster imports. Fix concrete failures before handover.

## Day 3 or earlier after acceptance: handover

- [ ] Publish the tested build and verify the live link/version.
- [ ] Prepare a short Arabic instruction card and QR code for the forms URL only; keep rosters separate.
- [ ] Explain that records are local to the device/browser, there is no automatic submission/sync yet, and regular exports/backups are needed.
- [ ] Agree with the headmaster on the report recipient and approved sharing destination, taking the no-cloud requirement into account.
- [ ] Distribute the grade roster privately through the agreed method and assist with the one-time setup.
- [ ] Preserve a known-good release for rollback and record a support contact for the first week.

## Release boundary

Synchronization to localhost, a general-supervisor dashboard, school hosting and a shared database are deferred. No additional forms are required for this release. If some rosters are not supplied by handover, existing manual-entry forms remain usable; the daily absence checklist requires a roster.

## Inputs needed

- Authorized names/classes for grades 6, 8 and 9; student identifiers if already available. No case histories or additional personal details are needed for roster setup.
- Availability of an iPhone user and an Android user for the short practical trial.
- Confirmation of the private roster-delivery method and where completed reports should be submitted during the unsynchronized phase.
