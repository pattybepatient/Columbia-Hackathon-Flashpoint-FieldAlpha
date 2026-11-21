#!/usr/bin/env node
// Bounded, PII-redacting Flashpoint MCP runner for Field Alpha.
// Commands:
//   node flashpoint_workflow.mjs status [--run-file <path>] [--recipients <path>]
//   node flashpoint_workflow.mjs survey-step --run-file <path> --round <n> --step <name> [--brief <text> | --confirm]
//   node flashpoint_workflow.mjs send-invites --run-file <path> --round <n> [--recipients <path>] [--confirm]
//   node flashpoint_workflow.mjs counts --run-file <path> --round <n>
//   node flashpoint_workflow.mjs export --run-file <path> --round <n> --out-redacted <csv> [--allow-paid-fallback]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = process.env.FIELD_ALPHA_REPO || '/home/hjiang/Columbia-Hackathon-Flashpoint-FieldAlpha';
const DEFAULT_RECIPIENTS = path.join(DEFAULT_REPO, 'flashpoint', 'recipients.local.txt');
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function redactEmails(value) {
  if (typeof value === 'string') return value.replace(EMAIL_RE, '[REDACTED_EMAIL]');
  if (Array.isArray(value)) return value.map(redactEmails);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactEmails(v);
    return out;
  }
  return value;
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) {
      opts[key] = true;
    } else {
      opts[key] = next;
      i++;
    }
  }
  return { cmd, opts };
}

async function loadFlashpointClient() {
  const candidates = [
    process.env.FLASHPOINT_CLIENT_PATH,
    path.join(DEFAULT_REPO, 'flashpoint', 'flashpoint.mjs'),
    path.resolve(SCRIPT_DIR, '../../../flashpoint/flashpoint.mjs'),
    '/home/hjiang/flashpoint-hack/flashpoint.mjs',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const mod = await import(pathToFileURL(p).href);
      return { mod, clientPath: p };
    }
  }
  throw new Error('Could not locate flashpoint.mjs in repo or /home/hjiang/flashpoint-hack.');
}

function readRecipients(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const seen = new Set();
  const valid = [];
  for (const line of raw) {
    const clean = line.trim().toLowerCase();
    if (!clean || clean.startsWith('#')) continue;
    if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean) && !seen.has(clean)) {
      seen.add(clean);
      valid.push(clean);
    }
  }
  return valid;
}

function loadRunState(runFile, maxRunUsdc) {
  if (fs.existsSync(runFile)) {
    const data = JSON.parse(fs.readFileSync(runFile, 'utf8'));
    if (maxRunUsdc !== undefined) data.max_run_usdc = Number(maxRunUsdc);
    return data;
  }
  return {
    created_at: new Date().toISOString(),
    max_run_usdc: Number(maxRunUsdc ?? 6.0),
    spent_usdc_estimated: 0,
    initial_balance_usdc: null,
    latest_balance_usdc: null,
    rounds: {},
    history: [],
  };
}

function saveRunState(runFile, state) {
  fs.mkdirSync(path.dirname(path.resolve(runFile)), { recursive: true });
  const sanitized = redactEmails(state);
  const tmp = `${runFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sanitized, null, 2) + '\n');
  fs.renameSync(tmp, runFile);
}

function extractSurveyMetadata(resultObj, prevRound = {}) {
  const text = typeof resultObj === 'string'
    ? resultObj
    : JSON.stringify(resultObj ?? {});
  const surveyId =
    resultObj?.result?.survey_id ??
    resultObj?.survey_id ??
    prevRound.survey_id ??
    null;
  const conversationId =
    resultObj?.conversation_id ??
    resultObj?.result?.conversation_id ??
    prevRound.conversation_id ??
    null;
  const finalText =
    resultObj?.result?.final_text ??
    resultObj?.final_text ??
    (typeof resultObj === 'string' ? resultObj : JSON.stringify(resultObj));
  const links = (String(finalText).replaceAll('\\&', '&').match(/https:\/\/[^\s<>()[\]`"'\\]+/g) ?? [])
    .filter(u => !u.includes('basescan.org'));
  const lower = String(finalText).toLowerCase();
  const needsConfirm =
    (lower.includes('reply') && lower.includes('confirm')) ||
    lower.includes('**confirm**') ||
    lower.includes('"confirm"');
  return {
    survey_id: surveyId,
    conversation_id: conversationId,
    final_text: redactEmails(String(finalText)),
    links: redactEmails(links),
    needs_confirm: needsConfirm,
  };
}

async function guardedPaidToolCall({ mod, state, runFile, roundKey, stepName, toolName, args, maxCallUsdc }) {
  const balBefore = Number(await mod.balance());
  if (state.initial_balance_usdc === null) state.initial_balance_usdc = balBefore;
  const walletDeltaSpent = Math.max(0, state.initial_balance_usdc - balBefore);
  const effectiveSpent = Math.max(state.spent_usdc_estimated, walletDeltaSpent);
  if (effectiveSpent + maxCallUsdc > state.max_run_usdc + 1e-6) {
    throw new Error(
      `Budget cap reached: spent ~${effectiveSpent.toFixed(2)} USDC + ${maxCallUsdc.toFixed(2)} call cap exceeds ${state.max_run_usdc.toFixed(2)} USDC run limit.`
    );
  }
  const markerDir = path.join(DEFAULT_REPO, 'flashpoint');
  fs.mkdirSync(markerDir, { recursive: true });
  const safeBase = path.basename(runFile).replace(/[^a-zA-Z0-9._-]/g, '_');
  const markerPath = path.join(markerDir, `${safeBase}.r${roundKey}.${stepName}.marker`);
  try {
    fs.writeFileSync(markerPath, new Date().toISOString() + '\n', { flag: 'wx', mode: 0o600 });
  } catch (err) {
    if (err.code === 'EEXIST') {
      throw new Error(
        `Idempotency guard: ${markerPath} already exists. Inspect server state before retrying to avoid duplicate billing.`
      );
    }
    throw err;
  }

  const client = await mod.connect();
  const maxUSDCUnits = Math.round(maxCallUsdc * 1_000_000);
  const rawResult = await mod.callTool(client, toolName, args, {
    allowPayment: true,
    maxUSDCUnits,
  });
  const balAfter = Number(await mod.balance());
  const callCost = Math.max(0, Number((balBefore - balAfter).toFixed(6)));
  state.spent_usdc_estimated = Number((state.spent_usdc_estimated + callCost).toFixed(6));
  state.latest_balance_usdc = balAfter;
  return { rawResult, callCost, balBefore, balAfter, client };
}

function validateXlsxBytes(bytes, tempPath) {
  if (bytes.length < 4 || !bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) {
    return false;
  }
  fs.writeFileSync(tempPath, bytes, { mode: 0o600 });
  try {
    const entries = execFileSync('/usr/bin/unzip', ['-Z1', tempPath], { encoding: 'utf8' }).split('\n');
    if (!entries.includes('xl/workbook.xml') || !entries.some(e => e.startsWith('xl/worksheets/'))) {
      fs.unlinkSync(tempPath);
      return false;
    }
    execFileSync('/usr/bin/unzip', ['-tq', tempPath], { stdio: 'ignore' });
    return true;
  } catch {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    return false;
  }
}

async function main() {
  const { cmd, opts } = parseArgs(process.argv.slice(2));
  const runFile = opts['run-file'] || path.join(DEFAULT_REPO, 'evidence', 'mcp_run_state.json');
  const recipientsFile = opts['recipients'] || DEFAULT_RECIPIENTS;
  const maxCallUsdc = Number(opts['max-call-usdc'] ?? 0.5);
  const maxRunUsdc = opts['max-run-usdc'] !== undefined ? Number(opts['max-run-usdc']) : undefined;
  const { mod, clientPath } = await loadFlashpointClient();

  if (cmd === 'status') {
    const bal = Number(await mod.balance());
    const recipients = readRecipients(recipientsFile);
    const state = loadRunState(runFile, maxRunUsdc);
    console.log(JSON.stringify({
      ok: true,
      client_path: clientPath,
      balance_usdc: bal,
      recipient_file_exists: fs.existsSync(recipientsFile),
      sendable_recipient_count: recipients.length,
      run_file: runFile,
      max_run_usdc: state.max_run_usdc,
      spent_usdc_estimated: state.spent_usdc_estimated,
      rounds: Object.fromEntries(
        Object.entries(state.rounds).map(([k, v]) => [k, {
          survey_id: v.survey_id,
          conversation_id: v.conversation_id,
          last_step: v.last_step,
          needs_confirm: v.needs_confirm,
          links: v.links,
        }])
      ),
    }, null, 2));
    return;
  }

  if (cmd === 'survey-step') {
    const roundKey = String(opts.round ?? '2');
    const stepName = String(opts.step ?? `step-${Date.now()}`);
    const brief = opts.confirm ? 'confirm' : opts.brief;
    if (!brief) throw new Error('Pass --brief "<instructions>" or --confirm.');

    const state = loadRunState(runFile, maxRunUsdc);
    const prevRound = state.rounds[roundKey] || {};
    const toolArgs = { brief };
    if (opts['survey-id'] || prevRound.survey_id) toolArgs.survey_id = opts['survey-id'] || prevRound.survey_id;
    if (opts['conversation-id'] || prevRound.conversation_id) {
      toolArgs.conversation_id = opts['conversation-id'] || prevRound.conversation_id;
    }

    const { rawResult, callCost, balAfter } = await guardedPaidToolCall({
      mod,
      state,
      runFile,
      roundKey,
      stepName,
      toolName: 'tool_survey',
      args: toolArgs,
      maxCallUsdc,
    });
    const meta = extractSurveyMetadata(rawResult, prevRound);
    state.rounds[roundKey] = {
      ...prevRound,
      ...meta,
      last_step: stepName,
      updated_at: new Date().toISOString(),
    };
    state.history.push({
      at: new Date().toISOString(),
      round: roundKey,
      step: stepName,
      cost_usdc: callCost,
      balance_after_usdc: balAfter,
      survey_id: meta.survey_id,
      conversation_id: meta.conversation_id,
      needs_confirm: meta.needs_confirm,
      summary: meta.final_text,
    });
    saveRunState(runFile, state);
    console.log(JSON.stringify({
      ok: true,
      round: roundKey,
      step: stepName,
      cost_usdc: callCost,
      balance_after_usdc: balAfter,
      ...meta,
    }, null, 2));
    return;
  }

  if (cmd === 'send-invites') {
    const roundKey = String(opts.round ?? '2');
    const recipients = readRecipients(recipientsFile);
    if (!recipients.length) {
      throw new Error(`No valid recipients found in ${recipientsFile}.`);
    }
    const state = loadRunState(runFile, maxRunUsdc);
    const prevRound = state.rounds[roundKey] || {};
    if (!prevRound.survey_id || !prevRound.conversation_id) {
      throw new Error(`Round ${roundKey} is missing survey_id or conversation_id in ${runFile}.`);
    }
    const isConfirm = Boolean(opts.confirm);
    const stepName = isConfirm ? 'send-invites-confirm' : 'send-invites-request';
    const subjectLine = opts.subject || 'Quick Field Alpha follow-up survey (1-2 mins)';
    const customMsg = opts.message || 'Thank you for helping test our Columbia Hackathon research study. Please complete this short follow-up survey.';
    const brief = isConfirm
      ? 'confirm'
      : [
          `Distribute email invitations for this published survey (${prevRound.survey_id}) to the following consented first-party email list (${recipients.length} recipients):`,
          recipients.join(', '),
          `Use subject: "${subjectLine}" and message: "${customMsg}".`,
          'Do NOT recruit paid third-party panels (no Prolific/Dynata/Cint). Send email invitations to this exact list only.',
        ].join('\n');

    const { rawResult, callCost, balAfter } = await guardedPaidToolCall({
      mod,
      state,
      runFile,
      roundKey,
      stepName,
      toolName: 'tool_survey',
      args: {
        survey_id: prevRound.survey_id,
        conversation_id: prevRound.conversation_id,
        brief,
      },
      maxCallUsdc,
    });
    const meta = extractSurveyMetadata(rawResult, prevRound);
    state.rounds[roundKey] = {
      ...prevRound,
      ...meta,
      recipient_count: recipients.length,
      last_step: stepName,
      updated_at: new Date().toISOString(),
    };
    state.history.push({
      at: new Date().toISOString(),
      round: roundKey,
      step: stepName,
      recipient_count: recipients.length,
      cost_usdc: callCost,
      balance_after_usdc: balAfter,
      survey_id: meta.survey_id,
      conversation_id: meta.conversation_id,
      needs_confirm: meta.needs_confirm,
      summary: meta.final_text,
    });
    saveRunState(runFile, state);
    console.log(JSON.stringify({
      ok: true,
      round: roundKey,
      step: stepName,
      recipient_count: recipients.length,
      cost_usdc: callCost,
      balance_after_usdc: balAfter,
      ...meta,
    }, null, 2));
    return;
  }

  if (cmd === 'counts') {
    const roundKey = String(opts.round ?? '2');
    const state = loadRunState(runFile, maxRunUsdc);
    const prevRound = state.rounds[roundKey] || {};
    const surveyId = opts['survey-id'] || prevRound.survey_id;
    const conversationId = opts['conversation-id'] || prevRound.conversation_id;
    if (!surveyId) throw new Error(`Round ${roundKey} has no survey_id.`);

    const stepName = `counts-${Date.now()}`;
    const args = {
      survey_id: surveyId,
      brief: 'Read the CURRENT live fieldwork counts for this published survey now. Return the count of real eligible completed responses, plus separate counts of screened-out and partial/in-progress starts if available. Exclude preview/test/synthetic rows if identifiable. Read-only aggregate counts only; do not export PII or modify the survey.',
    };
    if (conversationId) args.conversation_id = conversationId;

    const { rawResult, callCost, balAfter } = await guardedPaidToolCall({
      mod,
      state,
      runFile,
      roundKey,
      stepName,
      toolName: 'tool_survey',
      args,
      maxCallUsdc,
    });
    const meta = extractSurveyMetadata(rawResult, prevRound);
    state.rounds[roundKey] = {
      ...prevRound,
      ...meta,
      last_count_check: new Date().toISOString(),
      last_count_report: meta.final_text,
    };
    state.history.push({
      at: new Date().toISOString(),
      round: roundKey,
      step: 'counts',
      cost_usdc: callCost,
      balance_after_usdc: balAfter,
      summary: meta.final_text,
    });
    saveRunState(runFile, state);
    console.log(JSON.stringify({
      ok: true,
      round: roundKey,
      checked_at: new Date().toISOString(),
      cost_usdc: callCost,
      balance_after_usdc: balAfter,
      report: meta.final_text,
    }, null, 2));
    return;
  }

  if (cmd === 'export') {
    const roundKey = String(opts.round ?? '2');
    const outRedacted = opts['out-redacted'];
    if (!outRedacted) throw new Error('Pass --out-redacted <path/to/redacted.csv>.');
    const state = loadRunState(runFile, maxRunUsdc);
    const prevRound = state.rounds[roundKey] || {};
    const surveyId = opts['survey-id'] || prevRound.survey_id;
    const conversationId = opts['conversation-id'] || prevRound.conversation_id;
    if (!surveyId) throw new Error(`Round ${roundKey} has no survey_id.`);

    const rawXlsxPath = path.join(DEFAULT_REPO, 'flashpoint', `round${roundKey}-${Date.now()}.raw.xlsx`);
    const client = await mod.connect();
    const authHeader = client?.headers?.Authorization ?? client?.Authorization;
    const directUrl = `https://api.flashpoint.ai/api/v1/surveys/${surveyId}/exports/xlsx?with_labels=true`;
    let saved = false;
    let exportMethod = 'direct_rest_free';

    const directRes = await fetch(directUrl, {
      headers: { Authorization: authHeader },
      redirect: 'manual',
    });
    if (directRes.ok) {
      const bytes = Buffer.from(await directRes.arrayBuffer());
      saved = validateXlsxBytes(bytes, rawXlsxPath);
    }

    if (!saved && opts['allow-paid-fallback']) {
      exportMethod = 'paid_tool_survey_export_xlsx';
      const stepName = `export-${Date.now()}`;
      const args = {
        survey_id: surveyId,
        brief: 'Use native export_xlsx for the actual response records of this survey. Return the official downloadable file link only, preserving recorded answers, status, and original timestamps. No generated rows, emails in chat, public sharing, or survey changes.',
      };
      if (conversationId) args.conversation_id = conversationId;
      const { rawResult } = await guardedPaidToolCall({
        mod,
        state,
        runFile,
        roundKey,
        stepName,
        toolName: 'tool_survey',
        args,
        maxCallUsdc,
      });
      const rawText = String(rawResult?.result?.final_text ?? JSON.stringify(rawResult)).replaceAll('\\&', '&');
      const allUrls = rawText.match(/https:\/\/[^\s<>()[\]`"'\\]+/g) ?? [];
      const s3Link = allUrls.find(u => u.includes('.xlsx') && u.includes('X-Amz-Signature'));
      if (!s3Link) throw new Error('Paid export fallback did not return a signed .xlsx link.');
      const dl = await fetch(s3Link, { redirect: 'error', signal: AbortSignal.timeout(60000) });
      if (dl.ok) {
        const bytes = Buffer.from(await dl.arrayBuffer());
        saved = validateXlsxBytes(bytes, rawXlsxPath);
      }
      saveRunState(runFile, state);
    }

    if (!saved) {
      throw new Error('Could not obtain a valid .xlsx export (pass --allow-paid-fallback to use tool_survey export_xlsx).');
    }

    const pyScript = path.join(SCRIPT_DIR, 'finrobot_analyze.py');
    const outQuestions = opts['out-questions'] || outRedacted.replace(/\.csv$/i, '_questions.csv');
    execFileSync('python3', [
      pyScript,
      'redact-xlsx',
      '--xlsx', rawXlsxPath,
      '--out-csv', outRedacted,
      '--out-questions', outQuestions,
    ], { stdio: 'inherit' });

    console.log(JSON.stringify({
      ok: true,
      round: roundKey,
      export_method: exportMethod,
      redacted_csv: outRedacted,
      questions_csv: fs.existsSync(outQuestions) ? outQuestions : null,
    }, null, 2));
    return;
  }

  console.log('Usage: node flashpoint_workflow.mjs <status | survey-step | send-invites | counts | export> [options]');
}

main().catch(err => {
  console.error(redactEmails(err?.shortMessage || err?.message || String(err)));
  process.exitCode = 1;
});
