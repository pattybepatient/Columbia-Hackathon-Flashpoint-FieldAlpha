---
name: field-alpha-research
description: "Use when testing stock theses. Survey + FinRobot DCF."
version: 1.0.0
author: Field Alpha Team
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [Equity-Research, Flashpoint, MCP, x402, FinRobot, DCF, Survey]
    category: research
    related_skills: [survey-fieldwork, grounded-citations]
---

# Field Alpha Research (Flashpoint MCP + FinRobot)

End-to-end consumer-to-valuation research workflow: start from **one high-level question**, clarify survey structure only where needed, field autonomous primary surveys through **Flashpoint MCP** (x402 USDC on Base), extract quantitative behavioral signals from respondent answers, run deterministic valuation and reverse-DCF scenarios through **FinRobot**, and deliver a plain-language investment/research answer.

## When to Use

- Answering an equity or company thesis question by pairing primary consumer surveys (Flashpoint MCP) with deterministic valuation (FinRobot)
- Running autonomous multi-round survey fieldwork (create -> send to consented list -> gather & redact -> follow up) starting from a single user question
- Feeding primary respondent conversion, willingness-to-pay, and objection splits into FinRobot DCF, Reverse-DCF, and scenario valuation

## Architecture & Bundled Scripts

- `scripts/flashpoint_workflow.mjs` — Bounded Flashpoint MCP runner (`status`, `survey-step`, `send-invites`, `counts`, `export`) enforcing per-call (`$0.50`) and cumulative run (`$6.00`) USDC caps, write-once `.marker` idempotency files, `conversation_id`/`survey_id` state persistence, and automatic email/PII stripping from stdout and run logs.
- `scripts/finrobot_analyze.py` — Deterministic survey + FinRobot compute bridge (`redact-xlsx`, `summarize-survey`, `valuate`, `seed-sec`) wired to `/home/hjiang/FinRobot/finrobot_desktop` (`calculate_dcf`, `solve_for_implied_growth`, `market_implied_check`, `classify_market_implied_nature`, `margin_swing`, `calculate_sensitivity`, `seed_dcf_inputs`).
- `references/ttwo_nov2026_inputs.json` — Verified Take-Two Interactive (`NASDAQ: TTWO`) Nov 17 & Nov 18, 2026 filing and market inputs (reconciled to 8 decimal places against the Field Alpha workbook).

Repo mirror location: `/home/hjiang/Columbia-Hackathon-Flashpoint-FieldAlpha/skills/field-alpha-research/`.

## Step 1: One-Question Entrypoint & Brief Scoping

When the user gives a single high-level question or research objective:

1. **Check workspace state silently first ($0.00 spent):**
   - Run `node <skill_dir>/scripts/flashpoint_workflow.mjs status --run-file <repo>/evidence/mcp_run_state.json` to check wallet balance, saved recipient count (`flashpoint/recipients.local.txt`), and any active survey session.
   - Check `<repo>/evidence/` for prior survey rounds (e.g., `flashpoint_survey_questions.csv` and `flashpoint_survey_responses_redacted.csv`). Never re-ask questions already answered in baseline exports — build the next survey round directly on unresolved splits, price/time objections, or conversion triggers.
2. **Ask at most 1–3 concise, plain-language scoping questions (combine into ONE short message, skip anything already provided):**
   - **Survey focus / decision lever:** Propose a crisp 1-sentence hypothesis + 4–6 question structure tailored to their question (for example: testing what discount threshold, bundle perk, or post-launch window converts hesitant buyers), and ask if they want any tweak before building.
   - **Valuation target:** Confirm the ticker / FinRobot case (`TTWO` via `references/ttwo_nov2026_inputs.json`, or another US public ticker via `finrobot_analyze.py seed-sec`).
   - **One-time spend & send gate:** State the exact sendable recipient count (never echoing email addresses) and the hard spend caps (`$0.50` max per MCP call, `$6.00` max across the run), and get one explicit "go" before making paid calls or sending invitations.

Once approved, execute Steps 2–4 **autonomously end-to-end** without asking the user to direct individual steps.

## Step 2: Autonomous Flashpoint Survey Loop (Create -> Send -> Gather -> Iterate)

Use `scripts/flashpoint_workflow.mjs` from `/home/hjiang/Columbia-Hackathon-Flashpoint-FieldAlpha`:

1. **Draft questionnaire (`survey-step`):**
   Design a focused 4–7 question survey with clear screeners (only if needed — avoid mobile drop-off friction on opening screens) and structured single-select / willingness-to-pay / trade-off items that map cleanly to revenue or conversion drivers:
   ```bash
   node skills/field-alpha-research/scripts/flashpoint_workflow.mjs survey-step \
     --run-file evidence/mcp_run_state.json \
     --round 2 --step draft \
     --brief "<natural-language build spec>"
   ```
2. **Publish & handle confirmation on the SAME `conversation_id`:**
   Request publish readiness + live open link (no paid panel quotas unless explicitly requested). When Flashpoint replies with a confirmation prompt (`needs_confirm: true`), verify it matches the pre-approved scope (no unexpected panel charges) and confirm on the same round:
   ```bash
   node skills/field-alpha-research/scripts/flashpoint_workflow.mjs survey-step \
     --run-file evidence/mcp_run_state.json \
     --round 2 --step publish \
     --brief "Publish this survey with an open respondent link and no paid sample quotas."
   # When prompted to confirm:
   node skills/field-alpha-research/scripts/flashpoint_workflow.mjs survey-step \
     --run-file evidence/mcp_run_state.json \
     --round 2 --step publish-confirm --confirm
   ```
3. **Distribute to consented email list (`send-invites`):**
   `send-invites` reads `flashpoint/recipients.local.txt` internally so respondent emails never appear in CLI arguments, terminal output, or logs:
   ```bash
   node skills/field-alpha-research/scripts/flashpoint_workflow.mjs send-invites \
     --run-file evidence/mcp_run_state.json --round 2
   # Follow with --confirm on the same round when Flashpoint returns its email-send confirmation prompt:
   node skills/field-alpha-research/scripts/flashpoint_workflow.mjs send-invites \
     --run-file evidence/mcp_run_state.json --round 2 --confirm
   ```
4. **Monitor & export redacted responses (`counts` -> `export`):**
   Poll live completion counts cleanly, then export and auto-redact PII into `evidence/`:
   ```bash
   node skills/field-alpha-research/scripts/flashpoint_workflow.mjs counts \
     --run-file evidence/mcp_run_state.json --round 2
   node skills/field-alpha-research/scripts/flashpoint_workflow.mjs export \
     --run-file evidence/mcp_run_state.json --round 2 \
     --out-redacted evidence/round2_responses_redacted.csv --allow-paid-fallback
   ```
5. **Multi-round autonomous follow-up (when warranted):**
   Run `finrobot_analyze.py summarize-survey` on the newly exported CSV. If answers reveal an unresolved split or testable follow-up (e.g., splitting discount-waiters vs. bundle-upgraders, or testing exact price points), autonomously run `--round 3` with 3–5 surgical follow-up questions to the same recipient list and export `evidence/round3_responses_redacted.csv`.

## Step 3: Survey Signal Extraction -> FinRobot Valuation

Feed all completed redacted survey CSVs into `finrobot_analyze.py`:

1. **Summarize primary survey evidence across rounds:**
   ```bash
   python3 skills/field-alpha-research/scripts/finrobot_analyze.py summarize-survey \
     --csv evidence/flashpoint_survey_responses_redacted.csv \
     --csv evidence/round2_responses_redacted.csv \
     --out-json evidence/survey_summary.json
   ```
2. **Run FinRobot DCF, Reverse-DCF, and Survey-Conditioned Scenarios:**
   - For Take-Two (`TTWO`), use `skills/field-alpha-research/references/ttwo_nov2026_inputs.json` (or pass `--case-key 18`).
   - For any other US public ticker, first generate filing-backed inputs via `seed-sec --ticker <TICKER> --price <PRICE> --out-json evidence/<ticker>_inputs.json`.
   - Run valuation with survey scenarios attached:
   ```bash
   python3 skills/field-alpha-research/scripts/finrobot_analyze.py valuate \
     --inputs-json skills/field-alpha-research/references/ttwo_nov2026_inputs.json \
     --case-key 18 \
     --survey-csv evidence/flashpoint_survey_responses_redacted.csv \
     --survey-csv evidence/round2_responses_redacted.csv \
     --out-json evidence/finrobot_valuation_output.json
   ```
   Review how the survey-derived conversion rates, premium edition mix, and discount-vs-time hesitation compare against FinRobot's market-implied 10-year revenue CAGR hurdle, forward DCF base value, and ±2pp EBITDA margin sensitivity band.

## Step 4: Plain-Language Answer & Audit Artifacts

Deliver a clear, non-jargony answer structured around four points:
1. **Direct answer to the user's question** — clear takeaway upfront, honest about sample size (`N` completes cannot alone set a 12-month price target, so frame survey evidence as directional mechanism/scenario evidence alongside market-implied hurdles).
2. **What the survey rounds revealed** — concrete counts across Round 1 and follow-up rounds, highlighting what changed or sharpened in the follow-up round.
3. **What FinRobot shows** — market-implied annual revenue growth hurdle (Reverse DCF), forward DCF baseline, ±2pp margin sensitivity, and how survey-conditioned Bear / Base / Bull conversion scenarios move implied value and required growth.
4. **Saved artifacts** — confirm paths of redacted CSVs, `evidence/mcp_run_state.json`, `evidence/finrobot_valuation_output.json`, and any `README.md` run-log updates, verifying `git status` contains zero `.env`, raw `.xlsx`, or recipient files.

## Hard Safety & Privacy Rules

- **Never expose secrets or PII:** Never print, echo, copy into tracked files, or commit `.env`, wallet private keys, or respondent email addresses (`recipients.local.txt`). Keep raw `.xlsx` exports git-ignored (`0o600`).
- **Never retry timed-out paid calls blindly:** If a `.marker` file already exists because a 60–600s Flashpoint worker call timed out, inspect live state (`counts` or `app.flashpoint.ai` thread via read-only `survey-step`) before clearing any marker so the wallet is never double-billed.
- **Keep both skill copies synchronized:** Whenever updating this skill, mirror changes to `/home/hjiang/Columbia-Hackathon-Flashpoint-FieldAlpha/skills/field-alpha-research/`.
