# Deferred communication-form improvements

Recorded 25 September 2026. The user explicitly deferred these features; the current release only changes export styling and adds a prominent issuance timestamp to late-student exports.

- [ ] Stable document reference, retained when the same record is exported again.
- [ ] Recipient choices appropriate to the form, such as school administration, social worker or parent.
- [ ] Subject generated from the form and incident selections.
- [ ] Requested purpose/action where needed: for information, follow-up or action.
- [ ] Review supervisor signatures and add administrative approval only to forms that require it.
- [ ] Have the headmaster approve the templates and agree on the school’s sending and receiving workflow.

Keep these features mostly automatic or based on remembered selections. Do not add every field to every form. Their future design must account for local device storage and the absence of verified accounts or shared registration today.

Updated 26 September 2026: automatic saved-form delivery and a separate local incoming-records view are implemented as an opt-in pilot. Public HTTPS was verified, and an inbox-generated activation link connected the user's phone; a saved lateness form reached the laptop and was included in a validated backup. Carrier-data-only and physical-phone offline/reopen checks remain before wider enrollment. Roster/settings synchronization and filtered per-supervisor recovery JSON remain future work. See `CONNECTION.md`.
