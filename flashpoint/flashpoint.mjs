// Local client for the Flashpoint MCP × x402 hackathon manual.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createPublicClient, erc20Abi, formatUnits, http } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { Agent, setGlobalDispatcher } from 'undici';

const origin = 'https://api.flashpoint.ai';
const protocol = '2025-06-18';
const envFile = new URL('./.env', import.meta.url);
const usdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }));

function parseKey(input) {
  const value = input.trim().replace(/^FLASHPOINT_WALLET_KEY\s*=\s*/, '')
    .replace(/^(['"])(.*)\1$/, '$2').replace(/^0x/i, '');
  if (/^[0-9a-f]{40}$/i.test(value)) throw new Error('这看起来是钱包公开地址。请复制团队比赛钱包的 private key。');
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error('私钥应为 64 个十六进制字符，可带 0x 前缀。请只复制私钥这一项。');
  const key = '0x' + value;
  try { privateKeyToAccount(key); } catch { throw new Error('输入长度正确，但不是有效的 EVM 钱包私钥。'); }
  return key;
}
function account() {
  const key = process.env.FLASHPOINT_WALLET_KEY ||
    (fs.existsSync(envFile) && /^FLASHPOINT_WALLET_KEY=(.+)$/m.exec(fs.readFileSync(envFile, 'utf8'))?.[1]);
  if (!key) throw new Error('尚未配置钱包。双击 Setup.command，或设置 FLASHPOINT_WALLET_KEY。');
  return privateKeyToAccount(parseKey(key));
}
function saveKey(key) {
  fs.writeFileSync(envFile, 'FLASHPOINT_WALLET_KEY=' + key + '\n', { flag: 'wx', mode: 0o600 });
  return privateKeyToAccount(key).address;
}
async function post(path, body, headers = {}, transport = fetch) {
  return transport(origin + path, {
    method: 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
function check(response, step) {
  if (!response.ok) throw new Error(step + ' — HTTP ' + response.status);
}
async function decode(response) {
  const text = await response.text();
  const data = text.split(/\r?\n/).filter(line => line.startsWith('data:')).at(-1);
  const msg = JSON.parse(data ? data.slice(5).trim() : text);
  if (msg.error) throw new Error(msg.error.message || 'MCP request failed');
  return msg.result;
}
export async function connect() {
  const signer = account();
  const challenge = await post('/auth/wallet/challenge');
  check(challenge, 'Wallet challenge');
  const { nonce, message_to_sign } = await challenge.json();
  if (!nonce || message_to_sign !== 'flashpoint-mcp-auth:' + nonce)
    throw new Error('无法识别登录签名格式。请对照 Flashpoint 当前认证文档。');
  const signature = await signer.signMessage({ message: message_to_sign });
  const auth = await post('/auth/wallet/token', { address: signer.address, nonce, signature });
  check(auth, 'Wallet sign-in');
  const { token } = await auth.json();
  if (!token) throw new Error('登录响应没有 token。');
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': protocol };
  const init = await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: protocol, capabilities: {}, clientInfo: { name: 'field-alpha', version: '1.0' }
  } }, headers);
  check(init, 'MCP initialize');
  await decode(init);
  const session = init.headers.get('mcp-session-id');
  if (session) headers['Mcp-Session-Id'] = session;
  const ready = await post('/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' }, headers);
  check(ready, 'MCP initialized');
  await ready.text();
  return { headers, signer };
}
async function rpc(client, method, params, transport) {
  const res = await post('/mcp', { jsonrpc: '2.0', id: Date.now(), method, params }, client.headers, transport);
  check(res, method);
  return decode(res);
}
export async function listTools(client) {
  return (await rpc(client, 'tools/list', {})).tools;
}
export async function callTool(client, name, args = {}, { allowPayment = false, maxUSDCUnits } = {}) {
  const transport = allowPayment ? wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: 'eip155:8453', client: new ExactEvmScheme(client.signer) }],
    policies: maxUSDCUnits === undefined ? [] : [(_, offers) => offers.filter(o =>
      o.network === 'eip155:8453' && o.scheme === 'exact' && o.asset.toLowerCase() === usdc.toLowerCase() &&
      /^\d+$/.test(o.amount) && BigInt(o.amount) <= BigInt(maxUSDCUnits))]
  }) : fetch;
  const result = await rpc(client, 'tools/call', { name, arguments: args }, transport);
  const text = result?.content?.[0]?.text;
  if (result?.isError) throw new Error(text || 'Flashpoint tool returned an error.');
  if (text === undefined) return result;
  try { return JSON.parse(text); } catch { return text; }
}
export async function balance() {
  const client = createPublicClient({ chain: base, transport: http() });
  const amount = await client.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [account().address] });
  return formatUnits(amount, 6);
}
async function main() {
  const [cmd, tool, args = '{}', flag] = process.argv.slice(2);
  if (cmd === 'wallet') console.log(account().address);
  else if (cmd === 'create-wallet') console.log(saveKey(generatePrivateKey()));
  else if (cmd === 'import-wallet') {
    if (process.stdin.isTTY) throw new Error('请用 Setup.command 的隐藏输入导入。');
    console.log(saveKey(parseKey(fs.readFileSync(0, 'utf8'))));
  } else if (cmd === 'balance') console.log(await balance(), 'USDC on Base');
  else if (cmd === 'tools') {
    for (const t of await listTools(await connect())) console.log(t.name);
  } else if (cmd === 'call' && tool) {
    const argumentsObject = JSON.parse(args);
    console.log(JSON.stringify(await callTool(await connect(), tool, argumentsObject, { allowPayment: flag === '--pay' }), null, 2));
  } else console.log('flashpoint.mjs wallet | balance | tools | call <tool> <json> [--pay]');
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(err => { console.error(err.shortMessage || err.message); process.exitCode = 1; });
}
