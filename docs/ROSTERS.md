# Private rosters on the forms link

A roster is imported once from Settings and stored in the existing local browser store. The public site does not include student lists or upload imported files. Browser backups include the roster as well as drafts, profile and saved records.

## Phone use

1. Transfer the private roster JSON directly to the supervisor's phone and save it in local Files storage.
2. Open the forms link in the normal browser, then choose الإعدادات → تحميل قائمة الطلبة.
3. Choose the file. Check the grade and supervisor name.
4. Open الطلبة المتأخرون. Tick names, then use the class dropdown or next/previous-class buttons. Selections stay in the draft when switching classes.
5. Save or export. Each selected student's name and class appear in the report. Names not selected are omitted.

Cases support name search and class autofill. Daily and staffing class fields use roster classes. Missing names can still be entered manually. Existing filled manual lateness drafts remain usable; use New to start a roster checklist.

## Data rules

- Import validates the format, school, academic year, grade/class relationships and unique stable student IDs.
- Only names, stable internal IDs, grades, classes and ordering are retained. Other imported student attributes are discarded.
- Updating a roster replaces the lookup list. Saved records and filled drafts preserve their own student name/class snapshots.
- Removing the lookup list does not remove names already recorded in drafts or saved forms.
- Restore retains an installed roster, or restores the backup roster when none is installed. Use Update roster for an explicit replacement.
- Roster selection and historical authors are convenience data, not authenticated identity or a shared audit service.
- No cloud database or automatic submission/synchronization is introduced.

## Preparing grade seven from the local register

Run `python3 scripts/export-local-roster.py DATABASE OUTPUT_JSON`. The script opens the SQLite register read-only and exports active grade-seven students without case histories or official student numbers. Output inside this public repository is refused. Keep real files outside source, public, dist, test fixtures and commits.

## Checks

- `npm test`: roster validation, migration, snapshots, selection semantics and backward compatibility.
- `npm run check:roster`: synthetic 140-student phone flows, import, multi-class selection, search, manual names, persistence, exports, backup and offline behavior.
- `npm run check:interactions` and `npm run check:production`: existing forms and settings regression checks.
- `npm run check:layout`: long Arabic exports, including multiple classes in one lateness list.

A physical-phone trial is still needed for the device file picker and native sharing.
