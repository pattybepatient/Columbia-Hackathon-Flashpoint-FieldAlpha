#!/bin/zsh
set -eu
cd "${0:A:h}"
if ! command -v node >/dev/null; then
  runtimes=("$HOME"/.local/share/career-ops/node-v*-darwin-arm64/bin(N))
  if (( ${#runtimes} )); then export PATH="${runtimes[-1]}:$PATH"; fi
fi
print '查询当前正式问卷回收数，单次费用上限 0.50 USDC。'
print '按回车查询，或按 Ctrl-C 取消。'
read -r reply || exit 0
node --input-type=module <<'JS'
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {connect,callTool} from './flashpoint.mjs';
try {
 const activation=JSON.parse(readFileSync('gta-activation-response.json','utf8'));
 const survey_id=activation.result.survey_id;
 if (survey_id!=='dea63728-28e6-4019-b0ac-68a11b30bb7b') throw Error('问卷 ID 不符');
 const result=await callTool(await connect(),'tool_survey',{survey_id,conversation_id:activation.conversation_id,brief:'Read the CURRENT live fieldwork counts for the published survey from response records or the live survey dashboard now. Return a short Chinese report with the count of real eligible completed responses, plus separate counts of screened-out and partial/in-progress respondents if available. Exclude preview/test/synthetic records if identifiable. State retrieval time, how the source defines complete, and any categories you cannot distinguish. If the data cannot be read, say unavailable, never assume zero. Read-only aggregate counts, no exports or respondent details, no survey changes.'},{allowPayment:true,maxUSDCUnits:500000});
 const stamp=new Date().toISOString();
 const report=result?.result?.final_text ?? result;
 const tmp='gta-count-'+process.pid+'.tmp';
 writeFileSync(tmp,JSON.stringify({checkedAt:stamp,report},null,2),{mode:0o600});
 renameSync(tmp,'gta-latest-count.json');
 console.log(stamp,typeof report==='string'?report:JSON.stringify(report,null,2));
} catch(err) {console.error(err.shortMessage || err.message);process.exitCode=1;}
JS
