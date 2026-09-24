"""Export names/classes from a read-only local register to a PRIVATE file.
Usage: python3 scripts/export-local-roster.py DATABASE OUTPUT_JSON
The output must stay outside this public repository.
"""
import json
import sqlite3
import sys
from pathlib import Path

source, destination = (Path(arg).expanduser().resolve() for arg in sys.argv[1:3])
repo = Path(__file__).resolve().parents[1]
if destination.is_relative_to(repo):
    raise SystemExit("Roster output must be outside the public repository")
connection = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)
rows = [json.loads(row[0]) for row in connection.execute("SELECT data FROM students ORDER BY rowid")]
connection.close()
grade_names = {6: "الصف السادس", 7: "الصف السابع", 8: "الصف الثامن", 9: "الصف التاسع"}
trans = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
students = []
for row in rows:
    if row.get("archived"):
        continue
    class_name = row["className"]
    grade = int(class_name.translate(trans).split("/")[0])
    if grade != 7:
        continue
    students.append({"id": row["id"], "name": row["name"], "grade": grade_names[grade],
                     "className": class_name, "order": len(students)})
if not students or len({s["id"] for s in students}) != len(students):
    raise SystemExit("Empty roster or duplicate student IDs")
roster = {"format": "sprv-roster", "version": 1,
          "school": "مدرسة عمار بن ياسر المتوسطة للبنين", "year": "٢٠٢٦/٢٠٢٧", "students": students}
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(roster, ensure_ascii=False, indent=2) + "\n")
destination.chmod(0o600)
print(f"Prepared {len(students)} students in {len({s['className'] for s in students})} classes: {destination}")
