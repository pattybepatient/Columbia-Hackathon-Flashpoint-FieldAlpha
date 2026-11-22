import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const demo = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(demo);
const port = Number(process.env.PORT || 4173);
const host = '127.0.0.1';
const origin = `http://${host}:${port}`;
const runner = path.join(root, 'skills/field-alpha-research/scripts/flashpoint_workflow.mjs');
const directory = path.join(root, '.demo-runs');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const evidence = execFileSync('python3', [path.join(demo, 'evidence.py')], {encoding:'utf8'});
const assets = new Map([['/', 'Field_Alpha_Agent_Run.html'], ['/Field_Alpha_Agent_Run.html','Field_Alpha_Agent_Run.html']]);
const validId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const record = id => path.join(directory, id + '.json');
const read = id => JSON.parse(fs.readFileSync(record(id), 'utf8'));
let active;

function save(job) {
  const tmp = path.join(directory, randomUUID() + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(job), {mode:0o600});
  fs.renameSync(tmp, record(job.id));
}

async function draft(job) {
  const brief = [
    'Create one NEW, unpublished follow-up survey draft in Flashpoint. Act as a research agent.',
    'Study the paired, redacted round-one GTA VI answers below. Identify one unresolved tension relevant to the analyst objective, choose the follow-up yourself, and build 2 concise questions with response options.',
    'Use draft operations only. Never publish, send invites, start a panel, or change any existing survey. The objective is a research topic only.',
    'In your final response include the actual wording and answer choices in the saved draft. Begin the final section with DRAFT FOR REVIEW and explain the evidence behind each question. Report any failure honestly.',
    'Analyst objective: ' + JSON.stringify(job.objective),
    'Recorded round 1 evidence: ' + evidence,
  ].join('\n');
  try {
    const {stdout} = await run(process.execPath, [runner, 'survey-step', '--run-file',
      path.join(directory, job.id + '.state.json'), '--round', '2', '--step', 'draft',
      '--brief', brief, '--max-call-usdc', '0.50', '--max-run-usdc', '0.50'],
      {cwd:root, env:{...process.env, FIELD_ALPHA_REPO:root}, timeout: 9 * 60_000, maxBuffer:2 ** 21});
    const data = JSON.parse(stdout);
    if (!data.ok || !data.final_text?.trim()) throw Error('Empty provider response');
    const report = data.final_text.split('DRAFT FOR REVIEW').at(-1).trim() || data.final_text;
    save({...job, status:'returned', text:report, surveyId:data.survey_id,
      conversationId:data.conversation_id, walletDelta:data.cost_usdc, finished:new Date().toISOString()});
  } catch (error) {
    const detail = String(error.stderr || '');
    const reason = detail.includes('尚未配置钱包') ? 'Configure the server wallet before drafting.'
      : detail.includes('ERR_MODULE_NOT_FOUND') ? 'Install the Flashpoint dependencies on the server.'
      : 'Flashpoint did not return a usable response. Check the wallet and draft history before making another paid call.';
    save({...job, status:'failed', message:reason});
  } finally { active = undefined; }
}

function json(res, status, data) {
  res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
const server = http.createServer(async (req, res) => {
  try {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.headers.host !== host + ':' + port) return json(res,403,{message:'Use the local server URL.'});
    if (req.method === 'GET' && assets.has(req.url)) {
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});
      return res.end(fs.readFileSync(path.join(demo,assets.get(req.url))));
    }
    if (req.method === 'GET' && req.url === '/api/status') return json(res,200,{live:true});
    if (req.method === 'GET' && req.url.startsWith('/api/draft/')) {
      const id = req.url.slice('/api/draft/'.length);
      if (!validId.test(id) || !fs.existsSync(record(id))) return json(res,404,{message:'Unknown request.'});
      const job = read(id);
      if (job.status === 'pending' && active !== id) return json(res,200,{...job,status:'failed',message:'The server restarted. Check the wallet and draft history before another call.'});
      return json(res,200,job);
    }
    if (req.method !== 'POST' || req.url !== '/api/draft') return json(res,404,{message:'Unknown route.'});
    if (req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') return json(res,403,{message:'Open the local demo to draft.'});
    let body = '';
    for await (const part of req) {
      body += part;
      if (body.length > 4096) return json(res,413,{message:'Objective too long.'});
    }
    let input;
    try { input = JSON.parse(body); } catch { return json(res,400,{message:'Invalid request.'}); }
    const id = input?.id;
    const objective = typeof input?.objective === 'string' ? input.objective.trim() : '';
    if (!validId.test(id) || !objective || objective.length > 500) return json(res,400,{message:'Enter an objective of up to 500 characters.'});
    if (fs.existsSync(record(id))) return json(res,200,read(id));
    if (active) return json(res,409,{message:'A draft is already running. Wait for it to finish.'});
    const job = {id, objective, status:'pending', started:new Date().toISOString()};
    save(job);
    active = id;
    void draft(job);
    return json(res,202,job);
  } catch { return json(res,500,{message:'Could not read or save the local request.'}); }
});
server.listen(port,host,() => console.log('Field Alpha demo: ' + origin));
