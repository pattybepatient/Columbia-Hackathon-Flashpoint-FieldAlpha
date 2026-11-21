#!/bin/zsh
set -eu
cd "${0:A:h}"
if ! command -v node >/dev/null; then
  runtimes=("$HOME"/.local/share/career-ops/node-v*-darwin-arm64/bin(N))
  if (( ${#runtimes} )); then export PATH="${runtimes[-1]}:$PATH"; fi
fi
if [[ -f gta-draft-response.json ]]; then
  print 'Previously saved Flashpoint response:'
  cat gta-draft-response.json
  exit 0
fi
print 'Create the 10-question “Video game purchase plans” draft on Flashpoint.'
print 'Maximum charge: 0.50 USDC from the team wallet. No invitations or recruitment.'
while read -r 'answer?Type draft to continue, or press Return to exit: '; do
  case "${answer:l}" in
    draft) break ;;
    '') print 'Cancelled before contacting Flashpoint.'; exit 0 ;;
    *) print 'Please enter draft, or leave the line empty to cancel.' ;;
  esac
done
[[ "${answer:-}" != '' && "${answer:l}" == draft ]] || exit 0
print 'Connecting to Flashpoint to create the draft…'
node --input-type=module <<'JS'
import fs from 'node:fs';
import {connect, callTool} from './flashpoint.mjs';
const args = JSON.parse(fs.readFileSync('gta-draft.json', 'utf8'));
const h = await connect();
const marker = 'gta-draft-started.txt';
try {
  fs.writeFileSync(marker, new Date().toISOString(), {flag:'wx'});
} catch (err) {
  if (err.code !== 'EEXIST') throw err;
  console.error('A draft request was already attempted. Check Flashpoint before retrying to avoid duplicate billing.');
  process.exit(1);
}
try {
  const result = await callTool(h, 'tool_survey', args, {allowPayment:true, maxUSDCUnits:500000});
  const output = JSON.stringify(result,null,2) + '\n';
  fs.writeFileSync('gta-draft-response.json', output, {flag:'wx'});
  console.log(output);
} catch (err) {
  console.error('Draft request did not return a saved result:',err.message);
  process.exitCode=1;
}
JS
