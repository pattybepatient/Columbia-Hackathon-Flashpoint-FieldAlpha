#!/bin/zsh
set -eu
cd "${0:A:h}"
if ! command -v node >/dev/null; then
  runtimes=("$HOME"/.local/share/career-ops/node-v*-darwin-arm64/bin(N))
  if (( ${#runtimes} )); then export PATH="${runtimes[-1]}:$PATH"; fi
fi
umask 077
node --input-type=module <<'JS'
import { writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { connect, callTool } from './flashpoint.mjs';
import { createInterface } from 'node:readline/promises';
import { createReadStream } from 'node:fs';
const survey = 'dea63728-28e6-4019-b0ac-68a11b30bb7b';
async function saveWorkbook(response) {
  if (!response.ok) return false;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) return false;
  const name = 'Survey-Responses-' + new Date().toISOString().replace(/:/g, '-') + '.xlsx';
  writeFileSync(name, bytes, { flag: 'wx', mode: 0o600 });
  try {
    const entries = execFileSync('/usr/bin/unzip', ['-Z1', name], {encoding: 'utf8'}).split('\n');
    if (!entries.includes('xl/workbook.xml') || !entries.some(entry => entry.startsWith('xl/worksheets/'))) {
      throw new Error('下载文件缺少 Excel 工作表。');
    }
    execFileSync('/usr/bin/unzip', ['-tq', name], {stdio: 'ignore'});
  } catch (error) {
    unlinkSync(name);
    throw error;
  }
  console.log('Excel 已保存到：' + process.cwd() + '/' + name);
  return true;
}
try {
  const client = await connect();
  const url = new URL('/api/v1/surveys/' + survey + '/exports/xlsx?with_labels=true', 'https://api.flashpoint.ai');
  const response = await fetch(url, { headers: { Authorization: client.headers.Authorization }, redirect: 'manual' });
  if (!await saveWorkbook(response)) {
    console.log('直接下载没有返回 Excel 文件（HTTP ' + response.status + '）。');
    const input = createReadStream('/dev/tty');
    const prompt = createInterface({ input, output: process.stdout });
    let answer;
    try {
      answer = await prompt.question('改用比赛钱包请求官方导出链接，最多 0.50 USDC？输入 y 确认，或按回车退出：');
    } finally { prompt.close(); input.destroy(); }
    if (answer.trim().toLowerCase() === 'y') {
      const result = await callTool(client, 'tool_survey', {
        survey_id: survey, conversation_id: '01a1f090-cac5-7643-a44b-a190cb3d0979',
        brief: 'Use native export_xlsx for the actual response records of this survey. Return the official downloadable file link only, or a clear error if not available. Preserve recorded answers, status and original timestamps where available. No generated rows, emails, public sharing, or survey changes.'
      }, { allowPayment: true, maxUSDCUnits: 500000 });
      const report = result?.result?.final_text ?? result;
      const message = typeof report === 'string' ? report : JSON.stringify(report);
      const links = message.replaceAll('\\&', '&').match(/https:\/\/[^\s<>()\[\]`"'\\]+/g) ?? [];
      const link = links.map(value => new URL(value)).find(url =>
        url.origin === 'https://flashpoint-surveys-prod.s3.amazonaws.com' &&
        url.pathname.startsWith('/agent-exports/') && url.pathname.split('/').includes(survey) &&
        url.pathname.endsWith('.xlsx') && url.searchParams.has('X-Amz-Signature'));
      if (link) {
        const download = await fetch(link, {redirect: 'error', signal: AbortSignal.timeout(60000)});
        if (await saveWorkbook(download)) process.exit(0);
        console.log('下载未成功（HTTP ' + download.status + '）。');
      }
      console.log(message);
    }
  }
} catch (error) {
  console.error('导出失败：', error.cause?.code ?? error.shortMessage ?? error.message);
  process.exitCode = 1;
}
JS
