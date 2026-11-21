#!/bin/zsh
set -eu
cd "${0:A:h}"
if ! command -v node >/dev/null; then
  runtimes=("$HOME"/.local/share/career-ops/node-v*-darwin-arm64/bin(N))
  if (( ${#runtimes} )); then export PATH="${runtimes[-1]}:$PATH"; fi
fi
if [[ -f gta-publish-response.json ]]; then
  print 'Previously saved Flashpoint response:'
  cat gta-publish-response.json
  exit 0
fi
print 'Publish the existing “Video game purchase plans” survey and request its live respondent link.'
print 'Maximum charge: 0.50 USDC from the team wallet. No invitations or recruitment.'
print 'Connecting to Flashpoint to publish the existing survey…'
node --input-type=module <<'JS'
import fs from 'node:fs';
import {connect, callTool} from './flashpoint.mjs';
const draft = JSON.parse(fs.readFileSync('gta-draft-response.json','utf8'));
const survey_id = draft.result?.survey_id;
const conversation_id = draft.conversation_id;
if (draft.status !== 'completed' || survey_id !== 'dea63728-28e6-4019-b0ac-68a11b30bb7b' || !conversation_id) throw new Error('Cannot identify the completed draft.');
const args = {survey_id, conversation_id, brief:'I confirm publication of this existing survey exactly as previewed. Publish it now and return its verified live respondent link, current collection status and whether a shareable link can collect real responses directly. Do not distribute, email, recruit, create a panel, buy respondents, or change questions. If separate confirmation is required, return the exact prompt.'};
const h = await connect();
const marker = 'gta-publish-started.txt';
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
  fs.writeFileSync('gta-publish-response.json', output, {flag:'wx'});
  console.log(output);
} catch (err) {
  console.error('Publish request did not return a saved result:',err.message);
  process.exitCode=1;
}
JS
