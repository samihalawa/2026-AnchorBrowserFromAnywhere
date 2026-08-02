import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import WebSocket from 'ws';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ANCHOR_API_KEY = String(process.env.ANCHOR_API_KEY || process.env.ANCHORBROWSER_API_KEY || '').trim();
const APP_ACCESS_KEY = String(process.env.APP_ACCESS_KEY || '').trim();
const DEFAULT_FACEBOOK_COOKIES = String(process.env.FACEBOOK_COOKIES_JSON || '').trim();
const ANCHOR_API = 'https://api.anchorbrowser.io/v1';
const sessions = new Map();

const MUTATION_WORDS = /\b(post|publish|comment|reply|send|message|like|react|join|follow|invite|delete|remove|edit|change|upload|publica|publicar|comenta|comentar|responde|responder|envia|enviar|mensaje|unirse|seguir|elimina|editar|sube)\b/i;

export function classifyIntent(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return { kind: 'empty', needsConfirmation: false };
  const actionableText = text
    .replace(/\b(?:do not|don't|dont|never|without)\b[^.!?]*/gi, '')
    .replace(/\b(?:no|sin)\b[^.!?]*/gi, '');
  const needsConfirmation = MUTATION_WORDS.test(actionableText);
  return {
    kind: needsConfirmation ? 'write' : 'read',
    needsConfirmation,
    summary: needsConfirmation
      ? 'This request will change something on Facebook.'
      : 'This request only reads or navigates Facebook.',
  };
}

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

async function bodyJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1024 * 1024) throw new Error('Request body is too large.');
  }
  return body.trim() ? JSON.parse(body) : {};
}

function authorized(req) {
  if (!APP_ACCESS_KEY) return true;
  return String(req.headers['x-access-key'] || '') === APP_ACCESS_KEY;
}

function anchorHeaders(jsonBody = false) {
  const headers = { 'anchor-api-key': ANCHOR_API_KEY };
  if (jsonBody) headers['content-type'] = 'application/json';
  return headers;
}

async function anchorFetch(path, options = {}) {
  if (!ANCHOR_API_KEY) throw new Error('Anchor Browser is not configured.');
  const response = await fetch(`${ANCHOR_API}${path}`, {
    ...options,
    headers: { ...anchorHeaders(Boolean(options.body)), ...(options.headers || {}) },
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || payload?.raw || `HTTP ${response.status}`;
    throw new Error(`Anchor Browser ${response.status}: ${String(detail).slice(0, 500)}`);
  }
  return payload?.data ?? payload;
}

function parseCookies(rawCookies) {
  const parsed = typeof rawCookies === 'string' ? JSON.parse(rawCookies) : rawCookies;
  if (!Array.isArray(parsed)) throw new Error('Facebook cookies must be a JSON array.');
  const normalized = parsed
    .filter((cookie) => cookie?.name && cookie?.value !== undefined)
    .map((cookie) => ({
      name: String(cookie.name),
      value: String(cookie.value),
      domain: '.facebook.com',
      path: '/',
      secure: true,
      httpOnly: Boolean(cookie.httpOnly),
      sameSite: 'None',
      ...(cookie.expirationDate ? { expires: Number(cookie.expirationDate) } : {}),
    }));
  const names = new Set(normalized.map((cookie) => cookie.name));
  const missing = ['c_user', 'xs', 'datr', 'sb'].filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Facebook cookies are missing: ${missing.join(', ')}.`);
  return normalized;
}

function cdpClient(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  const ready = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    if (!message.id || !pending.has(message.id)) return;
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message || JSON.stringify(message.error)));
    else entry.resolve(message.result);
  });
  function send(method, params = {}, sessionId) {
    const id = nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    ws.send(JSON.stringify(message));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 30000);
      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
    });
  }
  return { ws, ready, send };
}

async function prepareFacebook(cdpUrl, rawCookies) {
  const cdp = cdpClient(cdpUrl);
  try {
    await cdp.ready;
    const targets = await cdp.send('Target.getTargets');
    let target = targets.targetInfos?.find((item) => item.type === 'page');
    if (!target) {
      const created = await cdp.send('Target.createTarget', { url: 'about:blank' });
      target = { targetId: created.targetId };
    }
    const attached = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const targetSession = attached.sessionId;
    await cdp.send('Network.enable', {}, targetSession);
    await cdp.send('Page.enable', {}, targetSession);
    const cookies = parseCookies(rawCookies);
    await cdp.send('Network.setCookies', { cookies }, targetSession);
    await cdp.send('Page.navigate', { url: 'https://www.facebook.com/' }, targetSession);
    await new Promise((resolve) => setTimeout(resolve, 8000));
    const inspected = await cdp.send('Runtime.evaluate', {
      expression: `({url:location.href,text:(document.body?.innerText||'').slice(0,800)})`,
      returnByValue: true,
    }, targetSession);
    const value = inspected?.result?.value || {};
    const loginVisible = /\/login|log into facebook|iniciar sesi[oó]n/i.test(`${value.url || ''} ${value.text || ''}`);
    return { authenticated: !loginVisible, url: value.url || 'https://www.facebook.com/', cookiesApplied: cookies.length };
  } finally {
    cdp.ws.close();
  }
}

async function createFacebookSession(clientId, cookies) {
  const data = await anchorFetch('/sessions', {
    method: 'POST',
    body: JSON.stringify({
      session: {
        initial_url: 'about:blank',
        timeout: { idle_timeout: 900, max_duration: 2400 },
        live_view: { read_only: false },
        tags: ['anchorbrowser-from-anywhere', 'facebook'],
      },
      browser: {
        headless: { active: false },
        viewport: { width: 1280, height: 900 },
        profile: { name: 'anchorbrowser-from-anywhere-facebook', persist: true },
      },
    }),
  });
  const prepared = await prepareFacebook(data.cdp_url, cookies);
  const record = {
    clientId,
    sessionId: data.id,
    liveViewUrl: data.live_view_url,
    createdAt: Date.now(),
    ...prepared,
  };
  sessions.set(clientId, record);
  return record;
}

async function getOrCreateSession(clientId, cookies) {
  const current = sessions.get(clientId);
  if (current) return current;
  return createFacebookSession(clientId, cookies);
}

async function closeSession(record) {
  if (!record?.sessionId) return;
  try {
    await anchorFetch(`/sessions/${encodeURIComponent(record.sessionId)}`, { method: 'DELETE' });
  } finally {
    sessions.delete(record.clientId);
  }
}

function sessionPayload(record) {
  if (!record) return null;
  return {
    clientId: record.clientId,
    sessionId: record.sessionId,
    liveViewUrl: record.liveViewUrl,
    authenticated: Boolean(record.authenticated),
    url: record.url || 'https://www.facebook.com/',
    cookiesApplied: Number(record.cookiesApplied || 0),
  };
}

export function recoverableLiveViewUrl(value, sessionId) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:'
      && url.hostname === 'live.anchorbrowser.io'
      && url.searchParams.get('sessionId') === sessionId;
  } catch {
    return false;
  }
}

async function restoreFacebookSession(clientId, input) {
  const current = sessions.get(clientId);
  if (current) return current;
  const sessionId = String(input.sessionId || '').trim();
  const liveViewUrl = String(input.liveViewUrl || '').trim();
  if (!sessionId || !recoverableLiveViewUrl(liveViewUrl, sessionId)) return null;
  try {
    const remote = await anchorFetch(`/sessions/${encodeURIComponent(sessionId)}`);
    if (String(remote.status || '').toLowerCase() !== 'running') return null;
    const record = {
      clientId,
      sessionId,
      liveViewUrl,
      createdAt: Date.parse(remote.created_at || '') || Date.now(),
      authenticated: Boolean(input.authenticated),
      url: String(input.url || 'https://www.facebook.com/'),
      cookiesApplied: Number(input.cookiesApplied || 0),
    };
    sessions.set(clientId, record);
    return record;
  } catch (error) {
    if (/Anchor Browser 404/.test(error.message)) return null;
    throw error;
  }
}

function cleanHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-8).map((item) => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    text: String(item?.text || '').trim().slice(0, 1200),
  })).filter((item) => item.text);
}

function executionPrompt(prompt, isWrite, history = []) {
  const conversation = cleanHistory(history)
    .map((item) => `${item.role === 'assistant' ? 'Agent' : 'User'}: ${item.text}`)
    .join('\n');
  return [
    'Work only inside the current Facebook browser session.',
    conversation ? `Recent conversation for context:\n${conversation}` : '',
    `User request: ${prompt}`,
    isWrite
      ? 'The user reviewed and explicitly confirmed this exact external action. Execute only that action.'
      : 'This is read-only. Do not post, comment, message, join, react, edit, or delete anything.',
    'Use the existing logged-in account. If login or two-factor authentication is required, stop and report it.',
    'At the end, report the exact Facebook page, what visibly happened, and any pending admin approval.',
  ].filter(Boolean).join('\n');
}

async function runTask(session, prompt, history) {
  const intent = classifyIntent(prompt);
  const url = `/tools/perform-web-task?sessionId=${encodeURIComponent(session.sessionId)}`;
  const result = await anchorFetch(url, {
    method: 'POST',
    body: JSON.stringify({
      prompt: executionPrompt(prompt, intent.needsConfirmation, history),
      agent: 'browser-use',
      max_steps: 60,
      detect_elements: true,
      human_intervention: true,
      async: true,
    }),
  });
  return {
    workflowId: result.workflow_id || result.workflowId || null,
    result: result.result || null,
    rawStatus: result.status || null,
  };
}

async function serveStatic(url, res) {
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  try {
    const data = await readFile(filePath);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

export function createApp() {
  return createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    try {
      if (url.pathname === '/health') {
        return json(res, 200, { ok: true, service: 'anchor-browser-from-anywhere', anchorConfigured: Boolean(ANCHOR_API_KEY), version: '1.0.0' });
      }
      if (url.pathname.startsWith('/api/') && !authorized(req)) return json(res, 401, { ok: false, error: 'Access key required.' });

      if (req.method === 'GET' && url.pathname === '/api/defaults') {
        return json(res, 200, { ok: true, cookies: DEFAULT_FACEBOOK_COOKIES || null });
      }

      if (req.method === 'POST' && url.pathname === '/api/session/restore') {
        const input = await bodyJson(req);
        const clientId = String(input.clientId || '').slice(0, 100);
        if (!clientId) return json(res, 400, { ok: false, error: 'Missing browser identity.' });
        const session = await restoreFacebookSession(clientId, input.session || {});
        return json(res, 200, { ok: true, session: sessionPayload(session) });
      }

      if (req.method === 'POST' && url.pathname === '/api/session') {
        const input = await bodyJson(req);
        const clientId = String(input.clientId || crypto.randomUUID()).slice(0, 100);
        if (input.replace === true && sessions.has(clientId)) await closeSession(sessions.get(clientId));
        const session = await getOrCreateSession(clientId, input.cookies);
        return json(res, 200, { ok: true, session: sessionPayload(session) });
      }

      if (req.method === 'DELETE' && url.pathname === '/api/session') {
        const input = await bodyJson(req);
        const record = sessions.get(String(input.clientId || ''));
        if (record) await closeSession(record);
        return json(res, 200, { ok: true });
      }

      if (req.method === 'POST' && url.pathname === '/api/preview') {
        const input = await bodyJson(req);
        const prompt = String(input.prompt || '').trim();
        const intent = classifyIntent(prompt);
        if (!prompt) return json(res, 400, { ok: false, error: 'Write a request first.' });
        return json(res, 200, { ok: true, prompt, ...intent });
      }

      if (req.method === 'POST' && url.pathname === '/api/run') {
        const input = await bodyJson(req);
        const prompt = String(input.prompt || '').trim();
        const clientId = String(input.clientId || '').trim();
        const intent = classifyIntent(prompt);
        if (!prompt || !clientId) return json(res, 400, { ok: false, error: 'Missing request or browser session.' });
        if (intent.needsConfirmation && input.confirmed !== true) return json(res, 409, { ok: false, needsConfirmation: true, prompt, ...intent });
        const session = await getOrCreateSession(clientId, input.cookies);
        const task = await runTask(session, prompt, input.history);
        return json(res, 200, { ok: true, task, session: { sessionId: session.sessionId, liveViewUrl: session.liveViewUrl, authenticated: session.authenticated } });
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/task/')) {
        const workflowId = decodeURIComponent(url.pathname.slice('/api/task/'.length));
        const status = await anchorFetch(`/tools/perform-web-task/${encodeURIComponent(workflowId)}/status`);
        return json(res, 200, { ok: true, status });
      }

      if (req.method === 'GET' && await serveStatic(url, res)) return;
      return json(res, 404, { ok: false, error: 'Not found.' });
    } catch (error) {
      console.error('[request-error]', error?.message || error);
      return json(res, 500, { ok: false, error: error?.message || String(error) });
    }
  });
}

if (process.argv[1] && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url))) {
  const server = createApp();
  server.listen(PORT, HOST, () => console.log(`Anchor Browser From Anywhere listening on http://${HOST}:${PORT}`));
  const shutdown = async () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2500).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
