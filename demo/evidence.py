"""Anonymous, paired categorical answers for the live follow-up brief."""
import csv
import json
from collections import Counter
from pathlib import Path

evidence = Path(__file__).resolve().parents[1] / "evidence"
with (evidence / "round1_responses_redacted.csv").open(newline="") as source:
    rows = [r for r in csv.DictReader(source) if r["Status"].upper() == "COMPLETE"]
with (evidence / "round1_questions.csv").open(newline="") as source:
    questions = {r["Label"]: r["Text and Options"]
                 for r in csv.DictReader(source) if r["Label"] in rows[0]}
keys = [key for key in questions if key in ("Q2", "Q3", "Q4", "Q5", "Q6")]
patterns = Counter((r["Source"], *(r[k] for k in keys)) for r in rows)
low_ceiling = {"Less than $50", "$50–$59.99", "$60–$69.99"}
synthetic = [r for r in rows if r["Source"] == "synthetic"]
later = [r for r in synthetic if r["Q2"].startswith("Buy later")]
verified = (
    f"Among {len(synthetic)} synthetic respondents, {sum(r['Q3'] in low_ceiling for r in synthetic)} "
    f"selected a price ceiling below $70. Of {len(later)} who chose full price later, "
    f"{sum(r['Q3'] in low_ceiling for r in later)} also selected a ceiling below $70."
)
print(json.dumps({
    "verified": verified,
    "questions": {k: questions[k] for k in keys},
    "paired_answers": [dict(zip(["source", *keys], pattern), count=count)
                       for pattern, count in patterns.items()],
}))
