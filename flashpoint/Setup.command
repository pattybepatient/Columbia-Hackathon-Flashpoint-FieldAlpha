#!/bin/zsh
set -eu
cd "${0:A:h}"
if ! command -v npm >/dev/null || ! command -v node >/dev/null; then
  candidates=("$HOME"/.local/share/career-ops/node-v*-darwin-arm64/bin(N))
  if (( ${#candidates} )); then export PATH="${candidates[-1]}:$PATH"; fi
fi
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  print -u2 '请先安装带 npm 的 Node.js 22.19 或更高版本。'; exit 1
fi
if [[ ! -f node_modules/.package-lock.json ]]; then
  if [[ -f package-lock.json ]]; then npm ci --ignore-scripts --no-audit --no-fund
  else npm install --ignore-scripts --no-audit --no-fund; fi
fi
node --input-type=module -e "await import('./flashpoint.mjs')"
print 'Flashpoint 客户端和依赖已就绪。'
if [[ ! -f .env && -z "${FLASHPOINT_WALLET_KEY:-}" ]]; then
  print '可选：在本机导入团队比赛钱包，然后免费列出工具。按回车即可跳过。'
  while true; do
    IFS= read -rs 'teamkey?团队比赛钱包私钥（输入隐藏）：' || exit 0
    print
    if [[ -z "$teamkey" ]]; then exit 0; fi
    if print -r -- "$teamkey" | node flashpoint.mjs import-wallet; then
      unset teamkey
      break
    fi
    unset teamkey
    if [[ -e .env ]]; then exit 1; fi
    print '可重新粘贴，也可以直接按回车退出。'
  done
fi
print '正在测试 Flashpoint 登录和免费工具列表…'
node flashpoint.mjs tools
