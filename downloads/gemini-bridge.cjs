// Local-only Gemini CLI bridge. Run: node gemini-bridge.cjs
// First install Google's CLI and sign in yourself: npm install -g @google/gemini-cli; gemini
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { spawn } = require('node:child_process');
const site = 'https://huyvulccd.github.io/study-tech-web/';
const port = 14583;
function findCLI() {
  const roots = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm/node_modules/@google/gemini-cli'),
    path.join(path.dirname(process.execPath), 'node_modules/@google/gemini-cli'),
    '/usr/local/lib/node_modules/@google/gemini-cli', '/usr/lib/node_modules/@google/gemini-cli',
    path.join(os.homedir(), '.npm-global/lib/node_modules/@google/gemini-cli'),
  ].filter(Boolean);
  const candidates = [process.env.GEMINI_CLI_ENTRY, ...roots.flatMap(folder => [path.join(folder, 'bundle/gemini.js'), path.join(folder, 'dist/index.js')])].filter(Boolean);
  return candidates.find(candidate => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile());
}
function makeRunner(cli) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'study-tech-gemini-'));
  fs.mkdirSync(path.join(folder, '.gemini'));
  fs.writeFileSync(path.join(folder, '.gemini/settings.json'), JSON.stringify({ tools: { core: [] }, context: { fileName: 'STUDY_BRIDGE_NO_CONTEXT.md' }, mcp: { allowed: [] }, hooksConfig: { enabled: false }, skills: { enabled: false }, security: { auth: { selectedType: 'oauth-personal', enforcedType: 'oauth-personal' } } }));
  const policy = path.join(folder, 'no-tools.toml');
  fs.writeFileSync(policy, '[[rule]]\ntoolName = "*"\ndecision = "deny"\npriority = 999\n\n[[rule]]\ntoolName = "*"\nmcpName = "*"\ndecision = "deny"\npriority = 999\n');
  return (prompt, signal) => new Promise((resolve, reject) => {
    // A fixed executable, fixed arguments and stdin prevent shell interpolation.
    // Cached Google login stays with the CLI, never returned to the website.
    const env = { ...process.env, GEMINI_CLI_NO_RELAUNCH: '1' };
    for (const key of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_USE_VERTEXAI']) delete env[key];
    const child = spawn(process.execPath, [cli, '--skip-trust', '--prompt', 'Answer the interview task supplied on standard input.', '--output-format', 'json', '--admin-policy', policy, '--extensions', 'none'], { cwd: folder, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '', settled = false;
    function finish(error, result) { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); if (error) reject(error); else resolve(result); }
    function abort() { child.kill(); finish(new Error('Đã dừng hoặc Gemini mất quá lâu để trả lời.')); }
    const timer = setTimeout(abort, 150000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.on('error', () => finish(new Error('Không khởi động được Gemini CLI. Kiểm tra lại cài đặt.')));
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 250000) abort(); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.stdin.on('error', () => {});
    child.on('close', code => {
      if (settled) return;
      try {
        if (code !== 0) throw new Error('Gemini CLI chưa trả lời được. Chạy gemini trong terminal để kiểm tra đăng nhập Google, hạn mức tài khoản và phiên bản CLI.');
        const result = JSON.parse(stdout);
        if (result.error || typeof result.response !== 'string' || !result.response.trim()) throw new Error('Gemini không trả về câu trả lời. Kiểm tra hạn mức và đăng nhập.');
        finish(null, result.response);
      } catch (error) { finish(error); }
    });
    child.stdin.end(`You are an interview tutor. Only answer the supplied task. Do not use tools, files, network tools or shell commands.\n${prompt}`);
  });
}
function createBridge({ token = randomBytes(32).toString('hex'), runner, allowedOrigin = new URL(site).origin }) {
  let busy = false;
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); } };
    if (req.headers.host !== `127.0.0.1:${server.address().port}` || req.headers.origin !== allowedOrigin) return send(403, { error: 'Origin or host not allowed.' });
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Max-Age': '600' }); res.end(); return;
    }
    const supplied = req.headers.authorization || '';
    const expected = `Bearer ${token}`;
    if (!/^Bearer [a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return send(401, { error: 'Mã kết nối không hợp lệ. Mở lại link được in trong cửa sổ cầu nối.' });
    if (req.method === 'GET' && req.url === '/health') return send(200, { ready: true, provider: 'Gemini CLI', login: 'Use the Google account signed into Gemini CLI on this machine.' });
    if (req.method !== 'POST' || req.url !== '/ask') return send(404, { error: 'Route not found.' });
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') return send(415, { error: 'JSON required.' });
    if (busy) return send(429, { error: 'Gemini đang trả lời câu khác. Hãy đợi rồi thử lại.' });
    busy = true;
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    const timer = setTimeout(() => controller.abort(), 155000);
    try {
      let body = '';
      req.setEncoding('utf8');
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 180000) { send(413, { error: 'Prompt too large.' }); return; }
      }
      let data; try { data = JSON.parse(body); } catch { send(400, { error: 'Invalid JSON.' }); return; }
      if (!data || typeof data.prompt !== 'string' || !data.prompt.trim() || data.prompt.length > 150000 || Object.keys(data).some(key => key !== 'prompt')) { send(400, { error: 'Invalid prompt.' }); return; }
      const response = await runner(data.prompt, controller.signal);
      if (typeof response !== 'string' || response.length > 100000) throw new Error('Invalid Gemini output.');
      send(200, { response });
    } catch (error) { send(502, { error: error.message || 'Gemini request failed.' }); }
    finally { clearTimeout(timer); busy = false; }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  return { server, token };
}
if (require.main === module) {
  const cli = findCLI();
  if (!cli) { console.error('Cài Node.js 22+ và Gemini CLI: npm install -g @google/gemini-cli\nSau đó chạy gemini và chọn Sign in with Google.\nNếu cài ở vị trí khác: đặt GEMINI_CLI_ENTRY tới bundle/gemini.js (hoặc dist/index.js của bản cũ).'); process.exitCode = 1; }
  else {
    const bridge = createBridge({ runner: makeRunner(cli) });
    bridge.server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Cổng 14583 đã được sử dụng. Dùng cửa sổ cầu nối đang mở hoặc dừng nó trước.' : 'Không mở được cầu nối cục bộ.'); process.exitCode = 1; });
    bridge.server.listen(port, '127.0.0.1', () => {
      console.log(`Cầu nối Gemini chỉ chạy trên máy này. Giữ cửa sổ này mở.\nMở link kết nối RIÊNG bên dưới (không chia sẻ link này):\n${site}#gemini-bridge=${bridge.token}\n\nMã kết nối: ${bridge.token}\nCho phép truy cập mạng cục bộ khi Chrome hỏi. Nhấn Ctrl+C để dừng cầu nối.`);
    });
  }
}
module.exports = { createBridge, findCLI };
