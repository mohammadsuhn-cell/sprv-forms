# نماذج الإشراف المدرسي

Arabic phone forms, separate from the local sprv register. The home screen offers four forms:

- Case details: six initial fields, optional extra details and follow-up dates.
- Daily brief: attendance and morning lateness counts by class, optional late student names, expandable teacher/substitute and facilities sections, notes and actions.
- Teachers and substitutes: cover periods first, optional absence and late-arrival details.
- Late students: Arabic grade then class dropdowns, student names and an automatic total. Arrival time, reason and action are optional. Grade seven has six classes; the other middle-school grades offer sections 1–10.

Ministry, educational district, school name and year are shared across form headers and PDF, Word and Excel exports. Each supervisor supplies their own name. Existing saved contents remain intact. Saved cases support due follow-ups and a six-column Excel register. Legacy register drafts remain in Settings; saved forms and backups retain the v1 storage format.

No API, accounts, analytics, or uploaded form data. Drafts and records use this browser's localStorage. JSON backup/restore is available in Settings. Clearing browser data removes local records.

Arabic Word exports use editable RTL paragraphs and tables with explicit complex-script typography. PDF pages use the browser's native canvas text shaping on complete Arabic lines, with local fonts and pagination. PDF text is rasterized, not selectable. Excel exports preserve planned-action labels. The blank downloadable Excel workbook has six columns, a native table for mobile Cards View, dropdowns and school settings. Blank templates contain no student data.

`npm install`, `npm run dev`, `npm test`, `npm run build`, `npm run check:production`.

The production check uses synthetic records, a temporary browser context and a local preview. It verifies mobile entry, saved data, old drafts, dependent grade/class dropdowns, late-student persistence after refresh, daily sections, PDF/Word/Excel, long table pagination and offline PDF. It does not access the live sprv register. Physical iPhone/Android validation remains a separate check.

The build precaches static assets and export libraries for offline use after the first successful visit. Deploy only `dist/`. Never include student rosters, completed forms, backups or the local sprv database. Static hosting needs no domain purchase.
