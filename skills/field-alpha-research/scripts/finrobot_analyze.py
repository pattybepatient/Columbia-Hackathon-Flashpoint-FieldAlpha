#!/usr/bin/env python3
"""Field Alpha Survey + FinRobot Valuation Bridge.

Deterministic pipeline connecting Flashpoint primary survey exports to
FinRobot's DCF, Reverse-DCF, Margin-Swing, Sensitivity, and SEC-seeding operators.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any

FINROBOT_DESKTOP = os.environ.get(
    "FINROBOT_DESKTOP_PATH", "/home/hjiang/FinRobot/finrobot_desktop"
)
if FINROBOT_DESKTOP not in sys.path and os.path.isdir(FINROBOT_DESKTOP):
    sys.path.insert(0, FINROBOT_DESKTOP)

from finrobot.engine.compute.operators.dcf import (  # noqa: E402
    calculate_dcf,
    calculate_sensitivity,
    classify_market_implied_nature,
    margin_swing,
    market_implied_check,
    solve_for_implied_growth,
)
from finrobot.engine.compute.operators.dcf_seed import seed_dcf_inputs  # noqa: E402
from finrobot.engine.models.financial import (  # noqa: E402
    BalanceSheet,
    DCFInputs,
    FinancialData,
    HistoricalMetrics,
    IncomeStatement,
    MarketData,
)

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PII_HEADER_PATTERNS = (
    "email",
    "e-mail",
    "ip",
    "ip_hash",
    "ip address",
    "location",
    "city",
    "region",
    "state",
    "country",
    "postal",
    "zip",
    "lat",
    "lon",
    "timezone",
    "time zone",
    "user agent",
    "user_agent",
    "browser",
    "respondent_id",
    "respondent id",
    "panel_id",
    "panel id",
    "session_id",
    "recipient",
    "token",
    "external_id",
)

NS_MAIN = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def _col_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha()).upper()
    idx = 0
    for ch in letters:
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return max(0, idx - 1)


def read_xlsx_sheets(xlsx_path: str | Path) -> dict[str, list[list[str]]]:
    """Stdlib .xlsx reader preserving exact column positions for sparse rows."""
    sheets: dict[str, list[list[str]]] = {}
    with zipfile.ZipFile(xlsx_path, "r") as zf:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            sroot = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in sroot.findall("main:si", NS_MAIN):
                texts = [t.text or "" for t in si.findall(".//main:t", NS_MAIN)]
                shared.append("".join(texts))

        wb = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rel_map = {
            r.attrib["Id"]: r.attrib["Target"].lstrip("/")
            for r in rels
            if "Id" in r.attrib and "Target" in r.attrib
        }

        for sheet_el in wb.findall(".//main:sheet", NS_MAIN):
            name = sheet_el.attrib.get("name", "Sheet")
            rid = sheet_el.attrib.get(
                "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id",
                "",
            )
            target = rel_map.get(rid, "")
            if not target.startswith("xl/"):
                target = f"xl/{target}"
            if target not in zf.namelist():
                continue

            ws = ET.fromstring(zf.read(target))
            rows_raw: list[dict[int, str]] = []
            max_col = 0
            for row_el in ws.findall(".//main:sheetData/main:row", NS_MAIN):
                row_dict: dict[int, str] = {}
                for c in row_el.findall("main:c", NS_MAIN):
                    ref = c.attrib.get("r", "A1")
                    cidx = _col_index(ref)
                    max_col = max(max_col, cidx + 1)
                    ctype = c.attrib.get("t", "")
                    val = ""
                    if ctype == "s":
                        v_el = c.find("main:v", NS_MAIN)
                        if v_el is not None and v_el.text is not None:
                            sidx = int(v_el.text)
                            val = shared[sidx] if 0 <= sidx < len(shared) else ""
                    elif ctype == "inlineStr":
                        val = "".join(
                            t.text or "" for t in c.findall(".//main:t", NS_MAIN)
                        )
                    else:
                        v_el = c.find("main:v", NS_MAIN)
                        val = v_el.text if (v_el is not None and v_el.text is not None) else ""
                    row_dict[cidx] = val.strip()
                rows_raw.append(row_dict)

            grid = [
                [r.get(col, "") for col in range(max_col)]
                for r in rows_raw
                if any(v != "" for v in r.values())
            ]
            sheets[name] = grid
    return sheets


def _is_pii_header(header: str) -> bool:
    h = header.strip().lower()
    if not h or h in ("#", "id"):
        return True
    if re.match(r"^(s|q)\d+\b", h):
        return False
    return any(pat == h or pat in h for pat in PII_HEADER_PATTERNS)


def cmd_redact_xlsx(args: argparse.Namespace) -> None:
    sheets = read_xlsx_sheets(args.xlsx)
    if not sheets:
        raise RuntimeError("No worksheets found in workbook.")

    # Prefer labeled response data sheet ('Data (labeled)') over coded/numeric sheets
    chosen_name = (
        next(
            (
                n
                for n in sheets
                if "label" in n.lower()
                and "codebook" not in n.lower()
                and "security" not in n.lower()
            ),
            None,
        )
        or next(
            (
                n
                for n in sheets
                if any(k in n.lower() for k in ("response", "data"))
                and "codebook" not in n.lower()
                and "question" not in n.lower()
                and "security" not in n.lower()
            ),
            next(iter(sheets.keys())),
        )
    )
    grid = sheets[chosen_name]
    if len(grid) < 1:
        raise RuntimeError(f"Worksheet '{chosen_name}' is empty.")

    headers = grid[0]
    keep_indices = [i for i, h in enumerate(headers) if not _is_pii_header(h)]
    clean_headers = [
        re.sub(r"\s+", " ", headers[i]).strip() for i in keep_indices
    ]

    start_idx = next(
        (
            pos
            for pos, h in enumerate(clean_headers)
            if "started" in h.lower() or "start" in h.lower()
        ),
        None,
    )
    status_idx = next(
        (pos for pos, h in enumerate(clean_headers) if h.lower() == "status"),
        None,
    )

    body_rows: list[list[str]] = []
    for raw_row in grid[1:]:
        vals = [
            EMAIL_RE.sub("[REDACTED_EMAIL]", raw_row[i] if i < len(raw_row) else "")
            for i in keep_indices
        ]
        if vals == clean_headers or (
            status_idx is not None and vals[status_idx].strip().lower() == "status"
        ):
            continue
        if any(v != "" for v in vals):
            body_rows.append(vals)

    if start_idx is not None:
        body_rows.sort(key=lambda r: r[start_idx] or "9999")

    out_path = Path(args.out_csv)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        final_headers = (
            clean_headers
            if clean_headers and clean_headers[0].lower() == "record"
            else ["record", *clean_headers]
        )
        writer.writerow(final_headers)
        for idx, row in enumerate(body_rows, start=1):
            if clean_headers and clean_headers[0].lower() == "record":
                row[0] = str(idx)
                writer.writerow(row)
            else:
                writer.writerow([str(idx), *row])

    # Extract codebook / question sheet ('Questions'), never 'Data (questions)'
    q_sheet = (
        next(
            (
                n
                for n in sheets
                if n.strip().lower() in ("questions", "codebook")
            ),
            None,
        )
        or next(
            (
                n
                for n in sheets
                if any(k in n.lower() for k in ("question", "codebook"))
                and "data" not in n.lower()
                and "response" not in n.lower()
            ),
            None,
        )
    )
    if q_sheet and args.out_questions:
        q_path = Path(args.out_questions)
        q_path.parent.mkdir(parents=True, exist_ok=True)
        with q_path.open("w", newline="", encoding="utf-8") as qfh:
            qwriter = csv.writer(qfh)
            for r in sheets[q_sheet]:
                qwriter.writerow([EMAIL_RE.sub("[REDACTED_EMAIL]", c) for c in r])


def summarize_single_csv(
    csv_path: str | Path,
    cutoff_utc: str | None = None,
    crosstabs: list[str] | None = None,
) -> dict[str, Any]:
    rows: list[dict[str, str]] = []
    with Path(csv_path).open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        headers = list(reader.fieldnames or [])
        for r in reader:
            rows.append({k: (v or "").strip() for k, v in r.items() if k is not None})

    status_col = next((h for h in headers if h.lower() == "status"), None)
    completed_col = next((h for h in headers if "completed" in h.lower()), None)

    status_counts: dict[str, int] = {}
    eligible_completes: list[dict[str, str]] = []
    post_cutoff_completes = 0

    for r in rows:
        st = (r.get(status_col, "COMPLETE") if status_col else "COMPLETE").upper()
        status_counts[st] = status_counts.get(st, 0) + 1
        if st == "COMPLETE":
            comp_ts = r.get(completed_col, "") if completed_col else ""
            if cutoff_utc and comp_ts and comp_ts >= cutoff_utc:
                post_cutoff_completes += 1
                continue
            eligible_completes.append(r)

    meta_cols = {
        "record",
        "#",
        "id",
        "status",
        "started at",
        "completed at",
        "version",
        "duration (minutes)",
        "device",
        "source",
        "panel",
        "sample source",
        "calibration",
        "segment",
        "flashpoint checks",
        "exclusion reason",
        "defender score",
    }
    question_cols = [
        h
        for h in headers
        if h.lower() not in meta_cols and not h.lower().startswith("quality")
    ]

    distributions: dict[str, dict[str, int]] = {}
    for q in question_cols:
        counts: dict[str, int] = {}
        for r in eligible_completes:
            ans = r.get(q, "")
            if ans:
                counts[ans] = counts.get(ans, 0) + 1
        distributions[q] = dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))

    crosstab_out: dict[str, dict[str, dict[str, int]]] = {}
    for pair in crosstabs or []:
        if ":" not in pair:
            continue
        col_a, col_b = pair.split(":", 1)
        if col_a in headers and col_b in headers:
            grid: dict[str, dict[str, int]] = {}
            for r in eligible_completes:
                va = r.get(col_a, "") or "(blank)"
                vb = r.get(col_b, "") or "(blank)"
                grid.setdefault(va, {})[vb] = grid.setdefault(va, {}).get(vb, 0) + 1
            crosstab_out[pair] = grid

    # Extract high-level commercial intent signals across all completed answers
    n_comp = len(eligible_completes)
    full_price_now = 0
    wait_discount = 0
    skip_or_no = 0
    budget_objection = 0
    time_objection = 0
    premium_edition = 0

    for r in eligible_completes:
        joined = " | ".join(r.get(q, "") for q in question_cols).lower()
        if any(
            kw in joined
            for kw in (
                "keep my existing pre-order",
                "buy during launch week",
                "buy at launch",
                "buy immediately",
                "subscribe now",
                "full price",
            )
        ):
            full_price_now += 1
        elif "wait for a discount" in joined or "wait for sale" in joined or "discount" in joined:
            wait_discount += 1
        elif "not buy" in joined or "skip" in joined or "do not plan to buy" in joined:
            skip_or_no += 1

        if "budget" in joined or "too expensive" in joined or "the price" in joined:
            budget_objection += 1
        if "no time" in joined or "do not have time" in joined or "time to play" in joined:
            time_objection += 1
        if "ultimate" in joined or "deluxe" in joined or "bundle" in joined or "$100" in joined:
            premium_edition += 1

    denom = max(1, n_comp)
    signals = {
        "eligible_completes": n_comp,
        "post_cutoff_excluded": post_cutoff_completes,
        "immediate_or_launch_share": round(full_price_now / denom, 4),
        "discount_waiter_share": round(wait_discount / denom, 4),
        "non_buyer_share": round(skip_or_no / denom, 4),
        "budget_objection_share": round(budget_objection / denom, 4),
        "time_constraint_share": round(time_objection / denom, 4),
        "premium_or_bundle_affinity_share": round(premium_edition / denom, 4),
    }

    return {
        "file": str(csv_path),
        "total_records": len(rows),
        "status_counts": status_counts,
        "cutoff_utc": cutoff_utc,
        "signals": signals,
        "question_distributions": distributions,
        "crosstabs": crosstab_out,
    }


def cmd_summarize_survey(args: argparse.Namespace) -> None:
    rounds = [
        summarize_single_csv(p, cutoff_utc=args.cutoff_utc, crosstabs=args.crosstab)
        for p in args.csv
    ]
    payload = {"round_count": len(rounds), "rounds": rounds}
    text = json.dumps(payload, indent=2)
    if args.out_json:
        Path(args.out_json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out_json).write_text(text + "\n", encoding="utf-8")
    print(text)


def _fade_growth_schedule(y1_growth: float, terminal_growth: float, years: int) -> list[float]:
    if years <= 1:
        return [y1_growth]
    return [
        y1_growth - (y1_growth - terminal_growth) * (i / (years - 1))
        for i in range(years)
    ]


def cmd_valuate(args: argparse.Namespace) -> None:
    raw = json.loads(Path(args.inputs_json).read_text(encoding="utf-8"))
    if "cases" in raw:
        key = args.case_key or raw.get("default_case") or next(iter(raw["cases"].keys()))
        case = raw["cases"][str(key)]
        ticker = raw.get("ticker", "UNKNOWN")
        company_name = raw.get("company_name", ticker)
    else:
        case = raw
        ticker = raw.get("ticker", "UNKNOWN")
        company_name = raw.get("company_name", ticker)

    close_price = float(args.close_price if args.close_price is not None else case["close_price"])
    horizon = int(case.get("horizon_years", len(case["dcf_inputs"]["revenue_growth_rates"])))
    base_inputs = DCFInputs(**case["dcf_inputs"])

    forward = calculate_dcf(base_inputs)
    rev_base = solve_for_implied_growth(
        base_inputs,
        target_price=close_price,
        horizon_years=horizon,
        tolerance=1e-9,
        max_iterations=80,
    )
    low_margin_inputs = base_inputs.model_copy(
        update={"ebitda_margin": max(0.01, base_inputs.ebitda_margin - 0.02)}
    )
    high_margin_inputs = base_inputs.model_copy(
        update={"ebitda_margin": min(0.95, base_inputs.ebitda_margin + 0.02)}
    )
    rev_low_margin = solve_for_implied_growth(
        low_margin_inputs,
        target_price=close_price,
        horizon_years=horizon,
        tolerance=1e-9,
        max_iterations=80,
    )
    rev_high_margin = solve_for_implied_growth(
        high_margin_inputs,
        target_price=close_price,
        horizon_years=horizon,
        tolerance=1e-9,
        max_iterations=80,
    )
    mi_check = market_implied_check(base_inputs, close_price, horizon_years=horizon)
    mi_nature = classify_market_implied_nature(base_inputs, close_price, horizon_years=horizon)
    swing = margin_swing(base_inputs)

    w_base = round(forward.wacc, 4)
    w_grid = [max(0.04, round(w_base + d, 4)) for d in (-0.01, -0.005, 0.0, 0.005, 0.01)]
    tg_base = base_inputs.terminal_growth_rate
    tg_grid = [max(0.01, round(tg_base + d, 4)) for d in (-0.01, -0.005, 0.0, 0.005)]
    sens = calculate_sensitivity(base_inputs, w_grid, tg_grid)

    survey_rounds = [
        summarize_single_csv(p, cutoff_utc=args.cutoff_utc)
        for p in (args.survey_csv or [])
    ]

    # Build deterministic survey-conditioned scenarios from latest survey signals
    scenarios: list[dict[str, Any]] = []
    if survey_rounds:
        latest_sig = survey_rounds[-1]["signals"]
        launch_sh = latest_sig["immediate_or_launch_share"]
        wait_sh = latest_sig["discount_waiter_share"]
        budget_sh = latest_sig["budget_objection_share"]
        time_sh = latest_sig["time_constraint_share"]
        prem_sh = latest_sig["premium_or_bundle_affinity_share"]

        base_y1 = base_inputs.revenue_growth_rates[0]
        tg = base_inputs.terminal_growth_rate

        # Scenario A: Price resistance / discount leakage (waiters stay sidelined or buy steeply discounted)
        bear_y1 = max(-0.05, base_y1 - 0.02 * (wait_sh + budget_sh))
        bear_margin = max(0.05, base_inputs.ebitda_margin - 0.015 * max(0.2, budget_sh))
        bear_inp = base_inputs.model_copy(
            update={
                "revenue_growth_rates": _fade_growth_schedule(bear_y1, tg, horizon),
                "ebitda_margin": bear_margin,
            }
        )

        # Scenario B: Survey-observed mix (full-price launch buyers + time-delayed full-price buyers + premium edition lift)
        observed_y1 = base_y1 + 0.03 * (launch_sh + 0.5 * time_sh) + 0.015 * prem_sh
        observed_margin = min(
            0.60, base_inputs.ebitda_margin + 0.01 * prem_sh - 0.005 * budget_sh
        )
        obs_inp = base_inputs.model_copy(
            update={
                "revenue_growth_rates": _fade_growth_schedule(observed_y1, tg, horizon),
                "ebitda_margin": observed_margin,
            }
        )

        # Scenario C: Targeted post-launch conversion (converting discount/time waiters via timed edition/bundle)
        bull_y1 = observed_y1 + 0.04 * wait_sh + 0.02 * prem_sh
        bull_margin = min(0.60, base_inputs.ebitda_margin + 0.02)
        bull_inp = base_inputs.model_copy(
            update={
                "revenue_growth_rates": _fade_growth_schedule(bull_y1, tg, horizon),
                "ebitda_margin": bull_margin,
            }
        )

        for name, desc, s_inp in [
            (
                "bear_discount_drag",
                "Price-sensitive waiters defer to steeper markdowns; lower margin & Y1 growth",
                bear_inp,
            ),
            (
                "survey_observed_mix",
                "Observed full-price + premium-edition affinity + time-delayed full-price realization",
                obs_inp,
            ),
            (
                "bull_waiter_conversion",
                "Targeted bundle / post-launch window converts hesitant waiters with +200bp margin",
                bull_inp,
            ),
        ]:
            s_dcf = calculate_dcf(s_inp)
            s_rev = solve_for_implied_growth(
                s_inp, target_price=close_price, horizon_years=horizon, tolerance=1e-9, max_iterations=80
            )
            scenarios.append(
                {
                    "scenario": name,
                    "description": desc,
                    "year1_growth": round(s_inp.revenue_growth_rates[0], 5),
                    "ebitda_margin": round(s_inp.ebitda_margin, 5),
                    "implied_fair_value_per_share": round(s_dcf.implied_price, 2),
                    "market_implied_10y_growth_hurdle": (
                        round(s_rev["implied_growth"], 5)
                        if s_rev.get("implied_growth") is not None
                        else None
                    ),
                }
            )

    implied_g = rev_base.get("implied_growth")
    year10_implied_rev = (
        base_inputs.revenue_base * ((1 + implied_g) ** horizon)
        if implied_g is not None
        else None
    )

    output = {
        "ticker": ticker,
        "company_name": company_name,
        "case_label": case.get("label", "Custom case"),
        "close_price": close_price,
        "horizon_years": horizon,
        "finrobot_core": {
            "wacc": round(forward.wacc, 6),
            "cost_of_equity": round(forward.cost_of_equity, 6) if forward.cost_of_equity else None,
            "forward_dcf_price_per_share": round(forward.implied_price, 2),
            "pv_explicit_fcf_usd": round(forward.pv_fcf_total, 2),
            "pv_terminal_value_usd": round(forward.pv_terminal, 2),
            "enterprise_value_usd": round(forward.enterprise_value, 2),
            "equity_value_usd": round(forward.equity_value, 2),
            "margin_swing_minus_2pp_plus_2pp": (
                [round(swing[0], 2) if swing[0] else None, round(swing[1], 2) if swing[1] else None]
                if swing
                else None
            ),
            "reverse_dcf": {
                "implied_annual_revenue_growth": round(implied_g, 6) if implied_g is not None else None,
                "implied_year_n_revenue_usd": round(year10_implied_rev, 2) if year10_implied_rev else None,
                "implied_growth_at_margin_minus_2pp": (
                    round(rev_low_margin["implied_growth"], 6)
                    if rev_low_margin.get("implied_growth") is not None
                    else None
                ),
                "implied_growth_at_margin_plus_2pp": (
                    round(rev_high_margin["implied_growth"], 6)
                    if rev_high_margin.get("implied_growth") is not None
                    else None
                ),
                "implied_wacc_at_seeded_growth": (
                    round(mi_check.implied_wacc, 6) if mi_check.implied_wacc is not None else None
                ),
                "market_implied_regime": mi_nature.kind,
            },
            "sensitivity_grid": sens,
        },
        "survey_rounds": survey_rounds,
        "survey_conditioned_finrobot_scenarios": scenarios,
    }

    text = json.dumps(output, indent=2)
    if args.out_json:
        Path(args.out_json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out_json).write_text(text + "\n", encoding="utf-8")
    print(text)


def _sec_get_json(url: str) -> Any:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "FieldAlphaResearch/1.0 (columbia-hackathon@example.edu)"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _extract_annual_series(facts: dict[str, Any], tags: list[str]) -> list[tuple[int, float]]:
    us_gaap = facts.get("facts", {}).get("us-gaap", {})
    for tag in tags:
        units = us_gaap.get(tag, {}).get("units", {}).get("USD", [])
        by_fy: dict[int, float] = {}
        for item in units:
            if item.get("form") not in ("10-K", "20-F"):
                continue
            fp = item.get("fp", "")
            if fp and fp != "FY":
                continue
            start, end = item.get("start"), item.get("end")
            if start and end and (int(end[:4]) - int(start[:4])) == 0 and start[5:7] != "01":
                continue
            fy = item.get("fy")
            val = item.get("val")
            if isinstance(fy, int) and isinstance(val, (int, float)):
                by_fy[fy] = float(val)
        if len(by_fy) >= 2:
            return sorted(by_fy.items())[-5:]
    return []


def cmd_seed_sec(args: argparse.Namespace) -> None:
    ticker = args.ticker.upper().strip()
    tickers_map = _sec_get_json("https://www.sec.gov/files/company_tickers.json")
    entry = next(
        (v for v in tickers_map.values() if str(v.get("ticker", "")).upper() == ticker),
        None,
    )
    if not entry:
        raise RuntimeError(f"Ticker {ticker} not found in SEC company_tickers.json.")

    cik = str(entry["cik_str"]).zfill(10)
    company_name = entry.get("title", ticker)
    facts = _sec_get_json(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json")

    revs = _extract_annual_series(
        facts,
        [
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "Revenues",
            "SalesRevenueNet",
        ],
    )
    opinc = _extract_annual_series(facts, ["OperatingIncomeLoss"])
    da = _extract_annual_series(
        facts,
        [
            "DepreciationDepletionAndAmortization",
            "DepreciationAndAmortization",
        ],
    )
    capex = _extract_annual_series(
        facts,
        [
            "PaymentsToAcquirePropertyPlantAndEquipment",
            "PaymentsToAcquireProductiveAssets",
        ],
    )
    if not revs:
        raise RuntimeError(f"Could not extract annual revenue series from SEC XBRL for {ticker}.")

    # Latest point-in-time balance sheet items
    us_gaap = facts.get("facts", {}).get("us-gaap", {})

    def _latest_usd(tags: list[str]) -> float:
        for t in tags:
            arr = us_gaap.get(t, {}).get("units", {}).get("USD", [])
            valid = [x for x in arr if isinstance(x.get("val"), (int, float)) and x.get("end")]
            if valid:
                valid.sort(key=lambda x: x["end"])
                return float(valid[-1]["val"])
        return 0.0

    def _latest_shares() -> float:
        dei = facts.get("facts", {}).get("dei", {})
        arr = dei.get("EntityCommonStockSharesOutstanding", {}).get("units", {}).get("shares", [])
        valid = [x for x in arr if isinstance(x.get("val"), (int, float)) and x.get("end")]
        if valid:
            valid.sort(key=lambda x: x["end"])
            return float(valid[-1]["val"])
        raise RuntimeError(f"Shares outstanding not found in SEC DEI facts for {ticker}.")

    shares = args.shares if args.shares else _latest_shares()
    cash = _latest_usd(["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsAndShortTermInvestments"])
    debt = _latest_usd(["LongTermDebt", "LongTermDebtNoncurrent"]) + _latest_usd(["LongTermDebtCurrent", "ShortTermBorrowings"])

    latest_rev = revs[-1][1]
    latest_op = opinc[-1][1] if opinc else None
    latest_da = da[-1][1] if da else 0.0
    latest_ebitda = (latest_op + latest_da) if latest_op is not None else None
    price = float(args.price)

    fin = FinancialData(
        ticker=ticker,
        company_name=company_name,
        income_statement=IncomeStatement(
            revenue=latest_rev,
            ebitda=latest_ebitda,
            operating_income=latest_op,
            depreciation_amortization=latest_da,
            capital_expenditure=capex[-1][1] if capex else None,
        ),
        balance_sheet=BalanceSheet(total_debt=debt, total_cash=cash),
        market_data=MarketData(
            market_cap=price * shares,
            shares_outstanding=shares,
            current_price=price,
            industry=args.industry,
        ),
    )
    hist = HistoricalMetrics(
        ticker=ticker,
        years=[y for y, _ in revs],
        revenue=[v for _, v in revs],
        ebitda=[
            (dict(opinc).get(y, 0.0) + dict(da).get(y, 0.0))
            for y, _ in revs
            if y in dict(opinc)
        ],
        capex=[dict(capex).get(y, 0.0) for y, _ in revs if y in dict(capex)],
        da=[dict(da).get(y, 0.0) for y, _ in revs if y in dict(da)],
    )
    dcf_inputs = seed_dcf_inputs(fin, hist)
    case_payload = {
        "ticker": ticker,
        "company_name": company_name,
        "label": f"SEC EDGAR XBRL + FinRobot seed ({ticker} @ ${price:.2f})",
        "close_price": price,
        "horizon_years": len(dcf_inputs.revenue_growth_rates),
        "dcf_inputs": dcf_inputs.model_dump(exclude={"assumption_provenance"}),
        "assumption_provenance": dcf_inputs.model_dump().get("assumption_provenance"),
    }
    text = json.dumps(case_payload, indent=2)
    if args.out_json:
        Path(args.out_json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out_json).write_text(text + "\n", encoding="utf-8")
    print(text)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Field Alpha Survey + FinRobot Bridge")
    sub = p.add_subparsers(dest="command", required=True)

    p_rx = sub.add_parser("redact-xlsx", help="Validate and convert raw .xlsx export to PII-redacted CSV")
    p_rx.add_argument("--xlsx", required=True)
    p_rx.add_argument("--out-csv", required=True)
    p_rx.add_argument("--out-questions", default=None)
    p_rx.set_defaults(func=cmd_redact_xlsx)

    p_sum = sub.add_parser("summarize-survey", help="Extract quantitative summary & intent signals from redacted CSVs")
    p_sum.add_argument("--csv", action="append", required=True)
    p_sum.add_argument("--cutoff-utc", default=None)
    p_sum.add_argument("--crosstab", action="append", default=[])
    p_sum.add_argument("--out-json", default=None)
    p_sum.set_defaults(func=cmd_summarize_survey)

    p_val = sub.add_parser("valuate", help="Run FinRobot DCF, Reverse-DCF, and survey-conditioned scenarios")
    p_val.add_argument("--inputs-json", required=True)
    p_val.add_argument("--case-key", default=None)
    p_val.add_argument("--close-price", type=float, default=None)
    p_val.add_argument("--survey-csv", action="append", default=[])
    p_val.add_argument("--cutoff-utc", default=None)
    p_val.add_argument("--out-json", default=None)
    p_val.set_defaults(func=cmd_valuate)

    p_sec = sub.add_parser("seed-sec", help="Seed FinRobot DCFInputs from live SEC EDGAR XBRL for any US ticker")
    p_sec.add_argument("--ticker", required=True)
    p_sec.add_argument("--price", type=float, required=True)
    p_sec.add_argument("--shares", type=float, default=None)
    p_sec.add_argument("--industry", default="Entertainment")
    p_sec.add_argument("--out-json", default=None)
    p_sec.set_defaults(func=cmd_seed_sec)

    return p


if __name__ == "__main__":
    parser = build_parser()
    ns = parser.parse_args()
    ns.func(ns)
