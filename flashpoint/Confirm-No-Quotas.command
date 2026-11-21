#!/bin/zsh
set -eu
cd "${0:A:h}"
if ! command -v node >/dev/null; then
  runtimes=("$HOME"/.local/share/career-ops/node-v*-darwin-arm64/bin(N))
  if (( ${#runtimes} )); then export PATH="${runtimes[-1]}:$PATH"; fi
fi
if [[ -f gta-quota-confirm-response.json ]]; then
  print 'Previously saved Flashpoint response:'
  cat gta-quota-confirm-response.json
  exit 0
fi
print 'Publish with no quotas: no cap on completed responses and no automatic balancing of respondent groups. Collection stays open until manually closed.'
print 'One more Flashpoint request, maximum 0.50 USDC. No recruitment or invitations.'
read -r 'ack?To accept, type "publish with no quotas" and press Return. Press Return alone to cancel: ' || exit 0
case "${ack:l}" in
  'publish with no quotas') ;;
  *) print 'Cancelled. No request made.'; exit 0 ;;
esac
print 'Connecting to Flashpoint to publish the existing survey…'
node --input-type=module <<'JS'
import fs from 'node:fs';
import {connect, callTool} from './flashpoint.mjs';
const draft = JSON.parse(fs.readFileSync('gta-publish-response.json','utf8'));
const survey_id = draft.result?.survey_id;
const conversation_id = draft.conversation_id;
if (draft.status !== 'completed' || survey_id !== 'dea63728-28e6-4019-b0ac-68a11b30bb7b' || !conversation_id) throw new Error('Cannot identify the completed draft.');
const args = {survey_id, conversation_id, brief:'I accept — publish with no quotas. I understand there is no cap on completions, no automatic sample balancing, and I must manually close collection. Publish it now and return its verified live respondent link, current collection status and whether a shareable link can collect real responses directly. Do not distribute, email, recruit, create a panel, buy respondents, or change questions. If separate confirmation is required, return the exact prompt.'};
const h = await connect();
const marker = 'gta-quota-confirm-started.txt';
try {
  fs.writeFileSync(marker, new Date().toISOString(), {flag:'wx'});
} catch (err) {
  if (err.code !== 'EEXIST') throw err;
  console.error('A publish request was already attempted. Check Flashpoint before retrying to avoid duplicate billing.');
  process.exit(1);
}
try {
  const result = await callTool(h, 'tool_survey', args, {allowPayment:true, maxUSDCUnits:500000});
  const output = JSON.stringify(result,null,2) + '\n';
  fs.writeFileSync('gta-quota-confirm-response.json', output, {flag:'wx'});
  console.log(output);
} catch (err) {
  console.error('Publish request did not return a saved result:',err.message);
  process.exitCode=1;
}
JS
