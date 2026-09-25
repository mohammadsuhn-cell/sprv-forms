# نماذج الإشراف المدرسي

Arabic phone forms, separate from the local sprv register. The home screen offers five forms:

- Case details: grouped incident types, dependent detail choices, location/period/source/recurrence dropdowns and a read-only Arabic sentence preview built from selected facts. Optional notes are appended to the narrative. Type-specific wording combines type and detail without repeating field labels. Previously written descriptions remain intact and editable through a separate legacy section; only generated drafts are rephrased when opened. Short action choices include a written undertaking and one-, two- or three-day suspension. Pending actions display as «لم يُنفّذ بعد», including historical exports, without rewriting saved records.
- Daily brief: attendance and morning lateness counts by class, optional late student names, expandable teacher/substitute and facilities sections, notes and actions.
- Teachers and substitutes: cover periods first, optional absence and late-arrival details.
- Daily absence sheet: tick absent students by class from a locally loaded roster, confirm every class (including zero absences), and export an Arabic landscape A4 PDF matching the paper grid. Class and grade totals are calculated from enrollment and selections. Enrollment can be corrected and missing absent names added. PDF only for this form.
- Late students: Arabic grade then class dropdowns, student names and an automatic total. Arrival time, reason and action are optional. Grade seven has six classes; the other middle-school grades offer sections 1–10.

Ministry, educational district, school name and year are shared across form headers and PDF, Word and Excel exports. Each supervisor supplies their own name. Existing saved contents remain intact. Saved cases support due follow-ups and a six-column Excel register. Legacy register drafts remain in Settings; saved forms and backups retain the v1 storage format.

No API, accounts, analytics, or uploaded form data. Drafts and records use this browser's localStorage. JSON backup/restore is available in Settings. Clearing browser data removes local records.

PDF and Word exports follow the absence-sheet style: ministry/district/school on the right, date/year details on the left, a fine divider, a centered Arabic title, lightly shaded table headings and signature lines. Late-student exports repeat a prominent issuance timestamp beneath the title, distinct from the attendance date and matching the fixed footer timestamp. Arabic Word exports remain editable, with RTL tables and explicit complex-script typography. Long tables repeat their headings across pages. The shared print palette lives in `src/export-style.js`. PDF pages use the browser's native canvas text shaping on complete Arabic lines, with local fonts and pagination. PDF text is rasterized, not selectable. Excel exports use the matching white letterhead, centered title and lightly shaded tables, retaining the six-column native case table and planned-action labels. Long case narratives continue into additional rows instead of being clipped. The blank downloadable Excel workbook has six columns, a native table for mobile Cards View, dropdowns and school settings. Blank templates contain no student data.

`npm install`, `npm run dev`, `npm test`, `npm run build`, `npm run check:production`, `npm run check:layout`.

The production check uses synthetic records, a temporary browser context and a local preview. It verifies mobile entry, saved data, old drafts, dependent grade/class dropdowns, late-student persistence after refresh, daily sections, PDF/Word/Excel, long table pagination and offline PDF. It does not access the live sprv register. `check:layout` exercises long narratives and student lists, verifies continuation headings and canvas bounds, and checks that Word/Excel exports preserve all content without mutating the source. Physical iPhone/Android validation remains a separate check.

The build precaches static assets and export libraries for offline use after the first successful visit. Deploy only `dist/`. Never include student rosters, completed forms, backups or the local sprv database. Static hosting needs no domain purchase.

`npm run check:absence` checks the daily absence workflow with synthetic students: per-class confirmations, date changes, reload persistence, saved history, manual corrections, Arabic PDF totals, right-to-left columns, long-list pagination and phone layout. Each sheet retains its class roll snapshot; roster updates do not rewrite history. Start each day with **جديد**. Changing a sheet’s date retains its selections but clears all class confirmations.

Generated PDF, Word and Excel files include the saved supervisor name and a fixed export timestamp in Kuwait time in their page footers. The form’s record date stays separate. Excel displays it in the page footer when printed or opened in print layout. Interface controls use Arabic/English text without decorative icons.

Deferred communication and credibility features are recorded in `docs/FUTURE-WORK.md`; this design update does not add reference numbers, recipients or approval workflows.
