# Field Alpha

[**Download the MCP challenge walkthrough**](https://github.com/pattybepatient/Columbia-Hackathon-Flashpoint-FieldAlpha/raw/refs/heads/mcp-challenge/demo/Field_Alpha_Agent_Run.html) · [**Read the three-round run log**](evidence/live_challenge_run_log.md) · [**Original project write-up**](docs/Field_Alpha_Project_Writeup_v6.pdf)

## Try a live follow-up

Four synthetic respondents planned to buy GTA VI later at full price. Three of those four also set their ceiling below $70. Open the workbench to see the full recorded study, or give the agent an objective and watch it draft its own follow-up to the first round.

For a live call, use Node.js 22.19 or later and Python 3 on the computer holding your Flashpoint wallet. Start from this challenge branch:

```sh
git clone --branch mcp-challenge https://github.com/pattybepatient/Columbia-Hackathon-Flashpoint-FieldAlpha.git
cd Columbia-Hackathon-Flashpoint-FieldAlpha
npm ci --prefix flashpoint
node demo/server.mjs
```

Configure `FLASHPOINT_WALLET_KEY` in your shell or in the ignored `flashpoint/.env` on that computer. Open **http://127.0.0.1:4173**. Edit the research objective and choose **Draft follow-up via MCP**. The local server passes the objective and paired, anonymized Round 1 choices to Flashpoint’s `tool_survey` through the challenge skill. Flashpoint chooses the question wording and creates a new unpublished draft. Each button press authorizes one call capped at **0.50 USDC**. The result displays Flashpoint’s reply, its survey ID when supplied, and the measured wallet balance change. Reloading the tab recovers the current request. Local run records are stored in ignored `.demo-runs/`.

In a live test on November 22, Flashpoint created an unpublished two-question draft for **0.50 USDC**. It asked which signal would trigger a launch-week purchase at $79.99, then tested whether strong reviews would change that choice.

The **Recorded run** tab replays the original three rounds for free. Double-clicking the downloaded HTML also opens that replay offline. For the business use case, select **Who it is for** in the replay.

Field Alpha pairs **autonomous multi-round consumer surveys via Flashpoint MCP** (paid per call in Base USDC over x402) with **deterministic DCF and Reverse-DCF valuation via FinRobot** to test equity theses from primary consumer behavior.

*Flashpoint AI × Columbia AI Club Hackathon · Engineering & Product track + $1,000 Flashpoint MCP Challenge*

Patrick Xiong, Haotian Jiang, and Rong Du

## Live $1,000 Flashpoint MCP Challenge Run: Take-Two (`NASDAQ: TTWO`) at `$210.00`

Starting from zero prior survey context and one high-level research question — *"Given Take-Two's $210 share price, how much revenue must GTA VI generate to justify the growth rate implied by the stock, and is TTWO cheap, fairly priced, or expensive?"* — our agent (`skills/field-alpha-research/`) autonomously ran 3 iterative Flashpoint MCP survey rounds, emailed unique tracked links to our 6 consented first-party recipients (without exposing PII), queried US Census `demographics` context to seed a 12-persona Flashpoint synthetic US gamer panel (gender marginals sampled; age, race, education, and income persona-generated independently) for immediate multi-round iteration while human email invites remain open, auto-redacted `.xlsx` exports, and fed the resulting conversion and ARPU signals into FinRobot.

- **Investment Verdict:** **Expensive at `$210.00` / share.**
- **FinRobot Reverse-DCF Hurdle:** At `$210.00`, Take-Two's stock implies **19.32% annual company-wide revenue growth for 10 years** on verified FY2026 / Q2 FY2027 inputs (`$6.41B` base revenue → `$37.48B` in Year 10; `16.56%` normalized EBITDA margin; `8.69%` WACC), requiring **`$102.62B`** of cumulative 10-year incremental revenue above Take-Two's `$89.32B` organic ex-GTA VI trajectory (`$81.49B` at `18.56%` margin, `$44.33B` at `24.0%` margin, or `$27.10B` at `28.0%` margin — roughly **2.7x to 10x** *GTA V*'s entire ~$8.5B–$10B 10-year bookings).
- **3-Round Flashpoint Survey Findings (`N=11` completes in R1; `N=12` completes in R2 & R3 combining `1` live human respondent + `11` synthetic panel completes, plus `6` consented email invites per round):**
  - **Round 1 (`446278e5-7baf-4205-97f3-1dff8d56f2d8` — Baseline):** Only `18.2%` bought at launch (`$79.99`/`$99.99`), `72.7%` reported max Standard WTP `< $70`, `63.6%` reported `$0` Year-1 extra add-on spend when add-ons were grouped together, and `70%` of buyers said *GTA VI* replaces other game purchases.
  - **Round 2 (`bcb9282c-e360-4eb3-9f6d-9fb430541a39` — Holdouts, DLC vs. GTA+ & Cannibalization, `N=12` incl. live human complete):** Under 90+ reviews and zero discounts for 9 months, **`66.7%` (`8/12`, including our live human PC respondent) waited for `$69.99` (`33.3%`) or `<= $59.99` (`33.3%`)**. Unbundling post-launch spend showed **`0%` (`0/12`) chose standalone monthly `GTA+`**, whereas **`50.0%` (`6/12`) would pay `$29.99–$39.99` for a single-player Story Expansion DLC** and **`50.0%` (`6/12`) would upgrade to `$99.99` Ultimate** if bundled with guaranteed Story DLC or Console-to-PC Cross-Buy; `36.4%` (`4/11`) of buyers reported partial cannibalization of other Take-Two titles (*NBA 2K*, *Civilization*, *Borderlands*).
  - **Round 3 (`fcaee07b-9da2-4cc2-92fb-36dacd8bd706` — 3-Year Spend, Bundle Conversion & Tail, `N=12` incl. live human complete):** Packaging Story DLC + Cross-Buy into `$99.99` Ultimate lifted launch-window buyers from `18.2%` to **`33.3%` (`4/12`)**, while **`50.0%` (`6/12`, including the live human respondent) still waited for `$59.99–$69.99`**, 3-year cumulative gross spend averaged **`$86.36` per buyer** (`$79.17` across all gamers), and **`50.0%` (`6/12`) spend `$0` after Year 2** unless Rockstar ships paid Story Expansion chapters.
- **Survey-Conditioned FinRobot Valuation:** Organic baseline `$71.92/share`; **Survey Bear `$75.86`** (`16.56%` margin, `$8.8B` 10Y net GTA VI rev; linear-fade `$61.76`); **Survey Base `$93.71`** (`18.56%` margin, ~75M 3Y copies @ `~$86–$89` gross ARPU, `$13.9B` 10Y net GTA VI rev; linear-fade `$82.42`); **Survey Bull `$145.92`** (`24.0%` margin, 100M+ 3Y copies, Story+Cross-Buy bundle, `$25.3B` 10Y net GTA VI rev; linear-fade `$106.92`).
- **On-Chain Base USDC Spend:** `18.50 USDC` start → `7.15 USDC` finish (**`11.35 USDC` total across 26 Flashpoint MCP calls**, max `0.50 USDC` per call, including post-response live `.xlsx` refresh exports; full trace in [`evidence/live_challenge_run_log.md`](evidence/live_challenge_run_log.md) and [`evidence/mcp_run_state.json`](evidence/mcp_run_state.json)).

### Earlier Pre-Launch Study Snapshot (Nov 18–19)

Five players completed our initial launch-eve Flashpoint survey before GTA VI’s New York launch. Three called the $79.99 price “somewhat high,” and all three stuck to their original plans. Two still wanted to wait for a discount. One cited their budget. The other said they had no time to play.

We built Field Alpha so an analyst covering Take-Two (NASDAQ: TTWO) can read those answers alongside a valuation. In the demo, you can follow each player’s answers, then use FinRobot’s model to see how much revenue growth Take-Two’s share price implied on November 17 and 18.

## Repository contents

| Path | What it is |
| --- | --- |
| `skills/field-alpha-research/` | Reusable Hermes Agent skill: bounded Flashpoint MCP runner (`scripts/flashpoint_workflow.mjs`), PII-redacting `.xlsx` parser & FinRobot DCF bridge (`scripts/finrobot_analyze.py`), and verified TTWO filing inputs |
| `evidence/live_challenge_run_log.md` | Full 3-round decision trace, live survey links, Base USDC spend ledger, and FinRobot GTA VI revenue bridge |
| `evidence/round1_*`, `round2_*`, `round3_*` | Redacted response CSVs and codebooks exported from all 3 live Flashpoint MCP survey rounds |
| `evidence/mcp_run_state.json` | Sanitized Flashpoint MCP run state, `survey_id`/`conversation_id` threads, and Base USDC reconciliation |
| `evidence/finrobot_valuation_output.json` | Deterministic FinRobot DCF, Reverse-DCF, sensitivity grid, and survey-conditioned scenarios at `$210` |
| `evidence/gta6_revenue_bridge.json` | Explicit 10-year GTA VI revenue bridge across margin regimes and Bear / Base / Bull unit and ARPU cases |
| `docs/` | Project write-up (main submission), PDF and plain text |
| `demo/Field_Alpha_Demo.html` | Offline interactive demo: valuation scenarios, paired survey answers, research note |
| `model/TTWO_Prelaunch_Report_with_Survey.xlsx` | Launch brief, valuation and model inputs |
| `flashpoint/` | Scripts that drafted, published, monitored and exported the survey through Flashpoint, with the saved Flashpoint responses |
| `evidence/flashpoint_survey_*` | Earlier pre-launch redacted survey export and questionnaire |

## How we used Flashpoint

Flashpoint was our primary research tool. Every call was paid in USDC on Base from the team wallet through Flashpoint's MCP server and the x402 payment protocol.

1. **Draft:** we sent Rong's finalized questionnaire to Flashpoint's survey agent, which built the survey (`flashpoint/Draft-Survey.command` → `gta-draft-response.json`).
2. **Publish:** the agent published it with an open respondent link (`Publish-Survey`, `Confirm-No-Quotas`, `Activate-Survey` → the matching `gta-*-response.json` files). The `gta-*-started.txt` files record when each request was sent.
3. **Monitor:** we queried live completion counts during fieldwork (`Check-Responses.command` → `gta-latest-count.json`).
4. **Export:** we downloaded the timestamped response records (`Export-Responses.command`). A redacted copy is in `evidence/`.

Flashpoint handled screening (US adults who own a PS5 or Xbox Series X|S), tracked where respondents stopped, and timestamped each record, which let us isolate the five completions before the New York release (00:00 ET, Nov 19).

## Run the autonomous research agent (`skills/field-alpha-research/`)

Our MCP Challenge tooling lives in [`skills/field-alpha-research/`](skills/field-alpha-research/SKILL.md). Given **one high-level equity/consumer research question** and a git-ignored email list, the agent autonomously:
1. Designs a mobile-friendly survey from the objective via Flashpoint MCP (`tool_survey`), validates logic (`surveycheck`), and publishes an open link.
2. Sends unique tracked invitations to the consented email list in `flashpoint/recipients.local.txt` without ever echoing email addresses to stdout, logs, or git.
3. Monitors/exports responses, strips PII from raw `.xlsx` workbooks into `evidence/`, diagnoses unresolved splits or objections, and launches targeted follow-up survey rounds on its own.
4. Feeds multi-round conversion, willingness-to-pay, and ARPU parameters into **FinRobot**'s deterministic DCF and Reverse-DCF operators to output a grounded valuation verdict.

**Prerequisites:** Node.js 22.19+, Python 3.11+ with `pydantic`, a local clone of [FinRobot](https://github.com/AI4Finance-Foundation/FinRobot) (`FINROBOT_DESKTOP_PATH`, defaults to `~/FinRobot/finrobot_desktop`), and a Base wallet holding USDC in `flashpoint/.env` (never committed).

```bash
# 1. Configure credentials & local recipient list (both git-ignored)
cd flashpoint && npm install
cp .env.example .env                    # set FLASHPOINT_WALLET_KEY=0x...
$EDITOR recipients.local.txt            # one consented email per line (never committed)
cd ..

# 2. Free status check ($0.00 USDC): verify wallet balance & sendable recipient count
node skills/field-alpha-research/scripts/flashpoint_workflow.mjs status \
  --run-file evidence/mcp_run_state.json

# 3. Reproduce the 3-round survey summary & FinRobot valuation offline ($0.00 USDC)
python3 skills/field-alpha-research/scripts/finrobot_analyze.py summarize-survey \
  --csv evidence/round1_responses_redacted.csv \
  --csv evidence/round2_responses_redacted.csv \
  --csv evidence/round3_responses_redacted.csv

python3 skills/field-alpha-research/scripts/finrobot_analyze.py valuate \
  --inputs-json skills/field-alpha-research/references/ttwo_nov2026_inputs.json \
  --case-key 18 --close-price 210.00 \
  --survey-csv evidence/round1_responses_redacted.csv \
  --survey-csv evidence/round2_responses_redacted.csv \
  --survey-csv evidence/round3_responses_redacted.csv
```

To launch a brand-new autonomous multi-round study in **Hermes Agent**, **Claude Code**, or **Cursor**, load `skills/field-alpha-research/SKILL.md` and pass a single high-level objective (enforces `$0.50` max per MCP call, configurable total-run USDC ceiling, and write-once `.marker` files so slow worker calls never double-bill).

## Run the original pre-launch demo

No installation, accounts or API keys needed. Open `demo/Field_Alpha_Demo.html` in a desktop browser (tested in Chrome). Source links need internet access.

1. **FinRobot valuation:** select Nov 18 and the base margin. The close implies 19.7% annual growth in Take-Two's total revenue for ten years. Switch the date or margin to recalculate.
2. **Player evidence:** filter by earlier purchase plan to see each player's answer before and after the price screen.
3. **Research note:** view or save the selected case.

The demo replays a completed study from saved inputs. It does not call FinRobot or Flashpoint live.

## Run the Flashpoint scripts

These scripts spend real USDC, so the saved responses in `flashpoint/` are the record of what we ran. Rerunning a draft or publish script prints the saved response instead of calling Flashpoint again.

**Prerequisites:** Node.js 22.19 or newer; a wallet on Base holding USDC (gas is not required).

```bash
cd flashpoint
npm install
cp .env.example .env   # then put your own private key in .env
node flashpoint.mjs balance   # free: shows the wallet's USDC balance on Base
node flashpoint.mjs tools     # free: lists Flashpoint's MCP tools
node flashpoint.mjs call <tool> '<json arguments>'   # paid call
```

**Environment variable**

| Name | Example | Purpose |
| --- | --- | --- |
| `FLASHPOINT_WALLET_KEY` | `0xYOUR_PRIVATE_KEY_HERE` | Private key of the paying wallet. Keep it only in `.env`, which is git-ignored. |

The `.command` files are zsh scripts for macOS (double-click or run in Terminal). Each asks for confirmation before a paid request and caps the charge at 0.50 USDC.

## What we built during the hackathon (Nov 13–21)

- The Flashpoint client and scripts in `flashpoint/`, and the fielded survey
- Analysis of the export, including the pre-release cutoff
- Reconstruction of the Nov 17 and Nov 18 closes with FinRobot's valuation code, checked across all six date and margin combinations
- The offline demo, workbook and write-up

## Prior work and tools

- **FinRobot** (AI4Finance Foundation, open source) supplied the valuation code: [operators at commit 63e1884](https://github.com/AI4Finance-Foundation/FinRobot/tree/63e1884a42ea7b729551a5424b4bd6a65af636e0/finrobot_desktop/finrobot/engine/compute/operators).
- `flashpoint/flashpoint.mjs` follows the setup code from the organizers' Flashpoint MCP × x402 hackathon manual.
- **AI tools:** Flashpoint was our primary research tool. ChatGPT supported planning. Codex helped analyze the export, build the demo and check its calculations. Claude helped draft an earlier research report, reviewed the demo and write-up, and helped prepare this repository.

## Data and privacy

`evidence/flashpoint_survey_responses_redacted.csv` and `evidence/round1..3_responses_redacted.csv` keep each record's status, timestamps, device/source category and answers while stripping respondent email addresses, location, time zone, browser user agent, IP hashes and individual respondent tokens. Raw `.xlsx` exports and `flashpoint/recipients.local.txt` are git-ignored (`0600` permissions), and `evidence/mcp_run_state.json` automatically masks email addresses as `[REDACTED_EMAIL]`.

## Limitations

Five self-selected pre-launch completions (Nov 18–19) and our 12-persona synthetic gamer panel (`N=11` eligible completes per round across Rounds 1–3, where Flashpoint sampled US adult gender marginals and persona-generated age, race, education and income independently while first-party email invitations remain open) cannot establish a market-wide demand curve or a standalone price target. They serve as directional scenario inputs alongside FinRobot's deterministic reverse-DCF hurdles. See "Limitations and the next test" in the write-up.

## Sources

- Flashpoint survey export, Nov 21, 2026 (redacted copy in `evidence/`)
- [FinRobot valuation code](https://github.com/AI4Finance-Foundation/FinRobot/tree/63e1884a42ea7b729551a5424b4bd6a65af636e0/finrobot_desktop/finrobot/engine/compute/operators)
- [Take-Two annual filing (FY ended Mar 31, 2026)](https://www.sec.gov/Archives/edgar/data/946581/000162828026037434/ttwo-20260331.htm)
- [Take-Two interim filing (quarter ended Sep 30, 2026)](https://www.sec.gov/Archives/edgar/data/946581/000162828026072254/ttwo-20260930.htm)
- [TTWO daily closing prices, Twelve Data](https://twelvedata.com/markets/908412/stock/nasdaq/ttwo/historical-data)
- [Rockstar Games pre-order announcement (release date and prices)](https://www.take2games.com/ir/news/rockstar-games-announces-pre-orders-grand-theft-auto-vi)
