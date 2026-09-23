# نماذج الإشراف المدرسي

Arabic phone forms, separate from the local sprv register. React/Vite static site. No API, accounts, analytics, or uploaded form data. School profiles, drafts and saved documents use this browser's localStorage. JSON backup/restore is available in Settings. Clearing browser data removes local records.

Four forms: case register, case details, staffing/cover, daily report. Arabic Word exports use editable RTL paragraphs/tables. PDFs render Arabic locally into paginated images, preserving visual layout; PDF text is not selectable. The explicit Share button uses the phone's share sheet when available and otherwise downloads the file.

`npm install`, `npm run dev`, `npm test`, `npm run build`.

The build precaches static assets and export libraries for offline use after the first successful visit. Deploy only `dist/`. Never include student rosters, completed forms, backups or the local sprv database. Static hosting needs no domain purchase.
