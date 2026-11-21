# Field Alpha

[**Read the project write-up (PDF)**](docs/Field_Alpha_Project_Writeup_v6.pdf) · [**Download the interactive demo (HTML)**](https://github.com/pattybepatient/Columbia-Hackathon-Flashpoint-FieldAlpha/raw/refs/heads/main/demo/Field_Alpha_Demo.html)

To run the demo, right-click the HTML link, choose **Save Link As…**, and save it as `Field_Alpha_Demo.html`. Double-click the file to open it in your browser.

Five players completed our Flashpoint survey before GTA VI’s New York launch. Three called the $79.99 price “somewhat high,” and all three stuck to their original plans. Two still wanted to wait for a discount. One cited their budget. The other said they had no time to play.

We built Field Alpha so an analyst covering Take-Two (NASDAQ: TTWO) can read those answers alongside a valuation. In the demo, you can follow each player’s answers, then use FinRobot’s model to see how much revenue growth Take-Two’s share price implied on November 17 and 18.

*Flashpoint AI × Columbia AI Club Hackathon · Engineering & Product track*

Patrick Xiong, Haotian Jiang, and Rong Du

## Repository contents

| Path | What it is |
| --- | --- |
| `docs/` | Project write-up (main submission), PDF and plain text |
| `demo/Field_Alpha_Demo.html` | Offline interactive demo: valuation scenarios, paired survey answers, research note |
| `model/TTWO_Prelaunch_Report_with_Survey.xlsx` | Launch brief, valuation and model inputs |
| `flashpoint/` | Scripts that drafted, published, monitored and exported the survey through Flashpoint, with the saved Flashpoint responses |
| `evidence/` | Redacted survey export and the questionnaire as Flashpoint built it |

## How we used Flashpoint

Flashpoint was our primary research tool. Every call was paid in USDC on Base from the team wallet through Flashpoint's MCP server and the x402 payment protocol.

1. **Draft:** we sent Rong's finalized questionnaire to Flashpoint's survey agent, which built the survey (`flashpoint/Draft-Survey.command` → `gta-draft-response.json`).
2. **Publish:** the agent published it with an open respondent link (`Publish-Survey`, `Confirm-No-Quotas`, `Activate-Survey` → the matching `gta-*-response.json` files). The `gta-*-started.txt` files record when each request was sent.
3. **Monitor:** we queried live completion counts during fieldwork (`Check-Responses.command` → `gta-latest-count.json`).
4. **Export:** we downloaded the timestamped response records (`Export-Responses.command`). A redacted copy is in `evidence/`.

Flashpoint handled screening (US adults who own a PS5 or Xbox Series X|S), tracked where respondents stopped, and timestamped each record, which let us isolate the five completions before the New York release (00:00 ET, Nov 19).

## Run the demo

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

`evidence/flashpoint_survey_responses_redacted.csv` keeps each record's status, timestamps, device type and answers. We removed location, time zone, browser user agent, IP hash and panel IDs, and did not publish the raw export. Records are sorted by start time and renumbered.

## Limitations

Five self-selected completions cannot establish a market-wide price response, total launch sales or a price target. Recruitment opened on launch eve, and 51 of 53 incomplete records stopped before the first question. See "Limitations and the next test" in the write-up.

## Sources

- Flashpoint survey export, Nov 21, 2026 (redacted copy in `evidence/`)
- [FinRobot valuation code](https://github.com/AI4Finance-Foundation/FinRobot/tree/63e1884a42ea7b729551a5424b4bd6a65af636e0/finrobot_desktop/finrobot/engine/compute/operators)
- [Take-Two annual filing (FY ended Mar 31, 2026)](https://www.sec.gov/Archives/edgar/data/946581/000162828026037434/ttwo-20260331.htm)
- [Take-Two interim filing (quarter ended Sep 30, 2026)](https://www.sec.gov/Archives/edgar/data/946581/000162828026072254/ttwo-20260930.htm)
- [TTWO daily closing prices, Twelve Data](https://twelvedata.com/markets/908412/stock/nasdaq/ttwo/historical-data)
- [Rockstar Games pre-order announcement (release date and prices)](https://www.take2games.com/ir/news/rockstar-games-announces-pre-orders-grand-theft-auto-vi)
