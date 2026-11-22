"""Anonymous, paired categorical answers for the live follow-up brief."""
import csv
import json
from collections import Counter
from pathlib import Path

evidence = Path(__file__).resolve().parents[1] / "evidence"
with (evidence / "round1_responses_redacted.csv").open(newline="") as source:
    rows = [r for r in csv.DictReader(source) if r["Status"].upper() == "COMPLETE"]
with (evidence / "round1_questions.csv").open(newline="") as source:
    questions = {r["Label"]: r["Text and Options"].split("\n")[0]
                 for r in csv.DictReader(source) if r["Label"] in rows[0]}
keys = [key for key in questions if key in ("Q2", "Q3", "Q4", "Q5", "Q6")]
patterns = Counter((r["Source"], *(r[k] for k in keys)) for r in rows)
print(json.dumps({
    "questions": {k: questions[k] for k in keys},
    "paired_answers": [dict(zip(["source", *keys], pattern), count=count)
                       for pattern, count in patterns.items()],
}))
