#!/bin/zsh
set -eu
cd "${0:A:h}"
if ! command -v node >/dev/null; then
  runtimes=("$HOME"/.local/share/career-ops/node-v*-darwin-arm64/bin(N))
  if (( ${#runtimes} )); then export PATH="${runtimes[-1]}:$PATH"; fi
fi
print '向 Flashpoint 询价：50 份真人合格完成，截止纽约时间 11 月 18 日 23:59。'
print '本次询价调用最多 0.50 USDC。按回车获取报价，按 Ctrl-C 取消。'
read -r reply || exit 0
node --input-type=module <<'JS'
import { connect, callTool } from './flashpoint.mjs';

const request = [
  'Quote only for 50 qualified human completes for the existing Video game purchase plans survey.',
  'Target US residents age 18+ who own a PS5 or Xbox Series X or S, using the existing screeners.',
  'Get an actual provider quote. Identify the provider, targeting available, cost per qualified complete,',
  'all-in total and currency, including any screen-out costs. Flag any costs or eligibility criteria the quote cannot cover.',
  'State earliest recruitment start and expected completes by November 18, 2026 at 11:59 pm America/New_York.',
  'If the provider cannot estimate by that hour, say so. Do not approve, pay for sample, launch or send invitations.'
].join(' ');

try {
  const response = await callTool(await connect(), 'panel', {
    action: 'recruit',
    survey_id: 'dea63728-28e6-4019-b0ac-68a11b30bb7b',
    conversation_id: '01a1f090-cac5-7643-a44b-a190cb3d0979',
    request
  }, { allowPayment: true, maxUSDCUnits: 500000 });
  const report = response?.result?.final_text ?? response;
  console.log(typeof report === 'string' ? report : JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error.shortMessage || error.message);
  process.exitCode = 1;
}
JS
