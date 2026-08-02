import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite').trim();
const FACEBOOK_CONTEXT_PATH = String(process.env.FACEBOOK_AGENT_CONTEXT_PATH || join(ROOT, 'context', 'facebook-agent-context.json')).trim();
const ANCHOR_API = 'https://api.anchorbrowser.io/v1';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const sessions = new Map();
export const SESSION_USER = 'kittyfb';
const APP_SESSION_TAGS = ['anchorbrowser-from-anywhere', 'facebook'];
const USER_SESSION_TAGS = [...APP_SESSION_TAGS, SESSION_USER];
const SESSION_IDLE_MINUTES = 15;
const SESSION_MAX_MINUTES = 1440;

function loadFacebookAgentContext() {
  const override = String(process.env.FACEBOOK_AGENT_CONTEXT || '').trim();
  if (override) {
    try { return JSON.parse(override); } catch { return { version: 'environment', freeform: override.slice(0, 20000) }; }
  }
  try { return JSON.parse(readFileSync(FACEBOOK_CONTEXT_PATH, 'utf8')); } catch { return { version: 'missing', operatingRules: [] }; }
}

const FACEBOOK_AGENT_CONTEXT = loadFacebookAgentContext();

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

export function isAgentConversation(prompt) {
  const text = String(prompt || '').trim().toLowerCase();
  return /\b(what are you doing|what do you do|what did you do|are you (still )?(working|doing)|how are you (working|doing)|current task|task status|your status|agent status)\b/.test(text);
}

const AGENT_TOOLS = [
  { name: 'navigate', purpose: 'Open Facebook pages and move between profiles, groups, activity, Marketplace, and Messenger.' },
  { name: 'search', purpose: 'Search Facebook and filter visible results.' },
  { name: 'read', purpose: 'Read and summarize visible posts, messages, notifications, listings, and page state.' },
  { name: 'scroll', purpose: 'Load and inspect more content in feeds, groups, and conversations.' },
  { name: 'click', purpose: 'Use Facebook buttons, links, menus, and controls.' },
  { name: 'type', purpose: 'Fill forms and compose posts, comments, stories, and messages.' },
  { name: 'upload', purpose: 'Attach a user-provided image or file when the task requires it.' },
  { name: 'human_handoff', purpose: 'Keep the same live session open for login, two-factor authentication, CAPTCHA, or manual input.' },
];

function asksForToolInventory(message, history = []) {
  const text = String(message || '').trim().toLowerCase();
  const direct = /\b(list|lsit|show|describe|what|which)\b.*\b(tools?|capabilit(?:y|ies))\b|\b(tools?|capabilit(?:y|ies))\b.*\b(list|lsit|have|available|use)\b/.test(text);
  const jsonFollowup = /\bjson\b/.test(text) && cleanHistory(history).slice(-4).some((item) => /\btools?|capabilit(?:y|ies)\b/i.test(item.text));
  return direct || jsonFollowup;
}

export function toolInventoryDecision(message, history = []) {
  if (!asksForToolInventory(message, history)) return null;
  const inventory = {
    agent: 'Anchor',
    conversation: true,
    browserSession: 'one primary provider-backed session with discreet history and optional parallel sessions',
    tools: AGENT_TOOLS,
  };
  const wantsJson = /\bjson\b/i.test(String(message || ''));
  const reply = wantsJson
    ? JSON.stringify(inventory, null, 2)
    : `I chat with you directly and use one persistent Facebook browser session only when you ask me to act.\n\n${AGENT_TOOLS.map((tool) => `- ${tool.name}: ${tool.purpose}`).join('\n')}`;
  return { mode: 'chat', reply, actionPrompt: '' };
}

function asksForMissingDetail(decision) {
  const reply = String(decision.reply || '');
  const actionPrompt = String(decision.actionPrompt || '');
  const asksForMissingDetail = /\b(tell me|let me know|please provide|what would you|what do you|which (?:post|story|message|person|group)|who (?:should|do)|where should|when should)\b/i.test(reply);
  const containsPlaceholder = /\b(the user provides|once (?:the user )?provides?|content to be provided|text or media (?:the user )?provides?)\b/i.test(actionPrompt);
  return asksForMissingDetail || containsPlaceholder;
}

export function shouldClarifyBeforeAction(decision) {
  return decision?.mode === 'action' && asksForMissingDetail(decision);
}

function matchesCampaign(message, campaign) {
  const text = String(message || '').toLowerCase();
  return campaign?.keywords?.some((keyword) => text.includes(String(keyword).toLowerCase()));
}

export function facebookContextForRequest(message) {
  const context = FACEBOOK_AGENT_CONTEXT;
  if (context.freeform) return String(context.freeform).slice(0, 20000);
  const campaigns = context.campaigns || {};
  const directMatches = Object.values(campaigns).filter((campaign) => matchesCampaign(message, campaign));
  const broadContentAction = /\b(story|stories|historia|historias|post|publica|publish|comment|comenta|reply|responde|lead|notification|marketplace)\b/i.test(String(message || ''));
  const selectedCampaigns = directMatches.length
    ? directMatches
    : (broadContentAction ? Object.values(campaigns) : []);
  const campaignSummary = Object.values(campaigns).map((campaign) => ({ goal: campaign.goal, knownFacts: campaign.knownFacts }));
  const relevantExamples = selectedCampaigns.map((campaign) => ({
    goal: campaign.goal,
    examples: campaign.examples,
  }));
  return [
    `Persistent Facebook context (${context.version || 'current'}):`,
    JSON.stringify({
      subject: context.subject,
      sourceSummary: context.sourceSummary,
      operatingRules: context.operatingRules,
      priorities: context.priorities,
      voice: context.voice,
      campaigns: campaignSummary,
      relevantExamples,
      autonomousDefaults: context.autonomousDefaults,
    }),
  ].join('\n').slice(0, 16000);
}

export function canResolveWithFacebookContext(message) {
  const text = String(message || '');
  const explicitAction = /\b(post|publish|share|create|comment|reply|find|search|check|review|read|publica|publicar|comenta|comentar|responde|responder|busca|buscar|revisa|revisar|lee|leer)\b/i.test(text);
  const resolvableTarget = /\b(story|stories|historia|historias|post|posts|feed|group|groups|grupo|grupos|comment|comments|comentario|comentarios|reply|replies|respuesta|respuestas|lead|leads|notification|notifications|notificacion|notificaciones|marketplace|inbox|bandeja)\b/i.test(text);
  return explicitAction && resolvableTarget;
}

function contextualActionPrompt(message) {
  const text = String(message || '').trim();
  if (/\b(story|stories|historia|historias)\b/i.test(text)) {
    return "Publish the most useful Facebook Story for Zimo Qiu's current campaign. Inspect the live account's recent posts, stories, messages, and engagement first; choose the highest-value active or overdue lane (Usera short-stay rooms or Chinese lessons); create concise natural Spanish copy in her established style; reuse suitable existing Facebook media if accessible or create a text story; omit any price, promotion, date, or availability that is not currently verified; and publish it.";
  }
  return `Complete this Facebook request autonomously using Zimo Qiu's saved context and the current live account: ${text} Inspect the visible target first, resolve details from current Facebook state, customize the result, and do not invent current prices, dates, availability, or recipients.`;
}

export function applyContextualAutonomy(message, decision) {
  if (!canResolveWithFacebookContext(message) || !asksForMissingDetail(decision)) return decision;
  return {
    mode: 'action',
    reply: "I have Zimo's Facebook history, campaigns, and writing style. I’ll inspect the current account, choose the most useful current content, and use suitable existing Facebook media or a text format without asking you to specify it again.",
    actionPrompt: contextualActionPrompt(message),
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

export function providerLiveViewUrl(sessionId) {
  const id = String(sessionId || '').trim();
  return id ? `https://live.anchorbrowser.io/inspector.html?sessionId=${encodeURIComponent(id)}` : '';
}

function providerSessionId(value) {
  return String(value?.session_id || value?.id || '').trim();
}

function providerSessionTags(value) {
  const tags = value?.tags || value?.configuration?.session?.tags || [];
  return Array.isArray(tags) ? tags.map(String) : [];
}

export function sessionBelongsToKitty(value) {
  const tags = providerSessionTags(value);
  return APP_SESSION_TAGS.every((tag) => tags.includes(tag));
}

export function sessionHistoryItem(value) {
  const sessionId = providerSessionId(value);
  const status = String(value?.status || '').toLowerCase();
  return {
    sessionId,
    user: SESSION_USER,
    status,
    createdAt: Date.parse(value?.created_at || '') || 0,
    duration: Number(value?.duration || 0),
    recordingAvailable: Boolean(value?.recording),
    liveViewUrl: status === 'running' ? providerLiveViewUrl(sessionId) : '',
    taggedUser: providerSessionTags(value).includes(SESSION_USER),
  };
}

async function listKittySessions(anchorRequest = anchorFetch) {
  const query = new URLSearchParams({
    limit: '50',
    sort_by: 'created_at',
    sort_order: 'desc',
    tags: APP_SESSION_TAGS.join(','),
  });
  const payload = await anchorRequest(`/sessions?${query}`);
  const source = Array.isArray(payload?.sessions) ? payload.sessions : [];
  return source.filter(sessionBelongsToKitty).map(sessionHistoryItem);
}

async function createFacebookSession(clientId, cookies, anchorRequest = anchorFetch, prepare = prepareFacebook) {
  const data = await anchorRequest('/sessions', {
    method: 'POST',
    body: JSON.stringify({
      session: {
        initial_url: 'about:blank',
        timeout: { idle_timeout: SESSION_IDLE_MINUTES, max_duration: SESSION_MAX_MINUTES },
        live_view: { read_only: false },
        recording: { active: true },
        tags: USER_SESSION_TAGS,
      },
      browser: {
        headless: { active: false },
        viewport: { width: 1280, height: 900 },
        profile: { name: 'anchorbrowser-from-anywhere-facebook', persist: true },
      },
    }),
  });
  const prepared = await prepare(data.cdp_url, cookies);
  const record = {
    clientId,
    user: SESSION_USER,
    sessionId: data.id,
    liveViewUrl: data.live_view_url,
    createdAt: Date.now(),
    status: 'running',
    ...prepared,
  };
  sessions.set(record.sessionId, record);
  return record;
}

async function getOrCreateSession(clientId, cookies, storedSession, anchorRequest = anchorFetch, prepare = prepareFacebook) {
  const restored = await restoreFacebookSession(clientId, storedSession || {}, anchorRequest);
  if (restored) return restored;
  const history = await listKittySessions(anchorRequest);
  const latest = history.find((item) => item.status === 'running');
  if (latest) return restoreFacebookSession(clientId, latest, anchorRequest);
  return createFacebookSession(clientId, cookies, anchorRequest, prepare);
}

async function closeSession(record, anchorRequest = anchorFetch) {
  if (!record?.sessionId) return;
  try {
    await anchorRequest(`/sessions/${encodeURIComponent(record.sessionId)}`, { method: 'DELETE' });
  } finally {
    sessions.delete(record.sessionId);
  }
}

function sessionPayload(record) {
  if (!record) return null;
  return {
    clientId: record.clientId,
    user: SESSION_USER,
    sessionId: record.sessionId,
    liveViewUrl: record.liveViewUrl,
    createdAt: Number(record.createdAt || Date.now()),
    status: record.status || 'running',
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

async function restoreFacebookSession(clientId, input, anchorRequest = anchorFetch) {
  const sessionId = String(input.sessionId || '').trim();
  if (!sessionId) return null;
  const suppliedLiveViewUrl = String(input.liveViewUrl || '').trim();
  const liveViewUrl = recoverableLiveViewUrl(suppliedLiveViewUrl, sessionId)
    ? suppliedLiveViewUrl
    : providerLiveViewUrl(sessionId);
  try {
    const remote = await anchorRequest(`/sessions/${encodeURIComponent(sessionId)}`);
    if (!sessionBelongsToKitty(remote) || String(remote.status || '').toLowerCase() !== 'running') return null;
    const current = sessions.get(sessionId);
    const record = {
      clientId,
      user: SESSION_USER,
      sessionId,
      liveViewUrl: current?.liveViewUrl || liveViewUrl,
      createdAt: Date.parse(remote.created_at || '') || Date.now(),
      status: 'running',
      authenticated: Boolean(current?.authenticated || input.authenticated),
      url: String(current?.url || input.url || 'https://www.facebook.com/'),
      cookiesApplied: Number(current?.cookiesApplied || input.cookiesApplied || 0),
    };
    sessions.set(sessionId, record);
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

function agentInstruction(context) {
  return [
    'You are Anchor, a warm conversational AI agent with optional Facebook browser tools.',
    'You have one current primary Anchor browser agent that can freely navigate, search, scroll, read, click, and fill pages to complete concrete Facebook requests.',
    'Other sessions may exist in discreet history, but every action runs only in the currently selected primary session.',
    'Reply naturally to greetings, questions, brainstorming, explanations, and drafting requests without using a browser.',
    'Questions about you, your capabilities, your status, what you are doing, or the current task are always conversation. Never start or queue a browser action for those questions.',
    'Choose mode "action" only when the user clearly asks you to inspect, navigate, search, read, or change Facebook now.',
    'A request to draft or improve text is conversation, not an action, unless the user explicitly asks you to publish or send it.',
    'Use recent conversation to resolve short follow-ups such as "do it".',
    'For mode "chat", set actionPrompt to an empty string.',
    'For mode "action", reply briefly about what you are about to do and provide a self-contained plain-language actionPrompt for the browser.',
    'The app handles required confirmation after your decision. Never tell the browser agent to request, invoke, or wait for another confirmation.',
    'Describe the complete outcome, not individual browser steps; the browser agent decides the navigation and tools needed autonomously.',
    'Use the persistent Facebook context and inspect the live account to resolve content, target, tone, priority, and existing-media choices whenever possible.',
    'A clear high-level request such as "publish a story" is actionable: decide the best current story from context and live activity. Do not ask the user what photo, video, or text to use when existing Facebook media or a text story can complete it.',
    'If an indispensable detail still truly prevents action after using context and live state, ask for it naturally in chat. Login, two-factor, CAPTCHA, or manual review can be completed by the user in the same live browser session.',
    'Whenever your reply asks the user for a missing detail, choose mode "chat" and leave actionPrompt empty. Never launch the browser while waiting for that answer.',
    'Obey requested output formats. If the user asks for JSON, return valid JSON text in reply and preserve the subject from recent conversation.',
    'The actionPrompt must include the complete requested outcome, including any publish, comment, send, or other visible change; never replace it with only a search step.',
    'Never put JSON, function calls, tool syntax, or code in actionPrompt.',
    'Never claim that a Facebook action completed; the browser tool will report the observed result.',
    'Use the user\'s language and keep replies concise.',
    context,
  ].join(' ');
}

function parseAgentDecision(payload) {
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text || '')
    .join('')
    .trim();
  if (!text) throw new Error('The conversational agent returned no reply.');
  let decision;
  try { decision = JSON.parse(text); } catch { throw new Error('The conversational agent returned an invalid reply.'); }
  const mode = decision?.mode === 'action' ? 'action' : 'chat';
  const reply = String(decision?.reply || '').trim();
  const actionPrompt = mode === 'action' ? String(decision?.actionPrompt || '').trim() : '';
  if (!reply) throw new Error('The conversational agent returned no reply.');
  if (mode === 'action' && !actionPrompt) throw new Error('The conversational agent did not describe the requested browser action.');
  return { mode, reply, actionPrompt };
}

async function converseWithGemini(message, history, context = facebookContextForRequest(message)) {
  if (!GEMINI_API_KEY) throw new Error('The conversational agent is not configured.');
  const contents = cleanHistory(history).map((item) => ({
    role: item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.text }],
  }));
  contents.push({ role: 'user', parts: [{ text: message }] });
  const response = await fetch(`${GEMINI_API}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: agentInstruction(context) }] },
      contents,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            mode: { type: 'STRING', enum: ['chat', 'action'] },
            reply: { type: 'STRING' },
            actionPrompt: { type: 'STRING' },
          },
          required: ['mode', 'reply', 'actionPrompt'],
        },
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Conversational agent ${response.status}: ${String(detail).slice(0, 300)}`);
  }
  return parseAgentDecision(payload);
}

function executionPrompt(prompt, isWrite, history = []) {
  const conversation = cleanHistory(history)
    .map((item) => `${item.role === 'assistant' ? 'Agent' : 'User'}: ${item.text}`)
    .join('\n');
  return [
    'Work only inside the current Facebook browser session.',
    'Act autonomously: navigate, search, scroll, inspect, and use the browser tools needed to complete the full request without asking for step-by-step permission.',
    conversation ? `Recent conversation for context:\n${conversation}` : '',
    facebookContextForRequest(prompt),
    `User request: ${prompt}`,
    isWrite
      ? 'The user reviewed and explicitly confirmed this exact external action. Execute only that action without requesting or invoking another confirmation.'
      : 'This is read-only. Do not post, comment, message, join, react, edit, or delete anything.',
    'Use the existing logged-in account. Ask for human input only when login, two-factor authentication, CAPTCHA, or an indispensable missing value blocks progress; keep the current page open for that input.',
    'At the end, report the exact Facebook page, what visibly happened, and any pending admin approval.',
  ].filter(Boolean).join('\n');
}

async function runTask(session, prompt, history, anchorRequest = anchorFetch) {
  const intent = classifyIntent(prompt);
  const url = `/tools/perform-web-task?sessionId=${encodeURIComponent(session.sessionId)}`;
  const result = await anchorRequest(url, {
    method: 'POST',
    body: JSON.stringify({
      prompt: executionPrompt(prompt, intent.needsConfirmation, history),
      agent: 'browser-use',
      max_steps: 120,
      detect_elements: true,
      highlight_elements: true,
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

export function createApp({ agentResponder = converseWithGemini, anchorRequest = anchorFetch, prepareFacebookSession = prepareFacebook } = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    try {
      if (url.pathname === '/health') {
        return json(res, 200, { ok: true, service: 'anchor-browser-from-anywhere', anchorConfigured: Boolean(ANCHOR_API_KEY), agentConfigured: Boolean(GEMINI_API_KEY), agentContextVersion: FACEBOOK_AGENT_CONTEXT.version || 'environment', sessionUser: SESSION_USER, version: '1.7.0' });
      }
      if (url.pathname.startsWith('/api/') && !authorized(req)) return json(res, 401, { ok: false, error: 'Access key required.' });

      if (req.method === 'GET' && url.pathname === '/api/defaults') {
        return json(res, 200, { ok: true, cookies: DEFAULT_FACEBOOK_COOKIES || null });
      }

      if (req.method === 'GET' && url.pathname === '/api/sessions') {
        const history = await listKittySessions(anchorRequest);
        const running = history.filter((item) => item.status === 'running');
        return json(res, 200, {
          ok: true,
          user: SESSION_USER,
          idleMinutes: SESSION_IDLE_MINUTES,
          sessions: history,
          activeSession: running[0] || null,
        });
      }

      const recordingMatch = req.method === 'GET'
        ? url.pathname.match(/^\/api\/sessions\/([^/]+)\/recording$/)
        : null;
      if (recordingMatch) {
        const sessionId = decodeURIComponent(recordingMatch[1]);
        const remote = await anchorRequest(`/sessions/${encodeURIComponent(sessionId)}`);
        if (!sessionBelongsToKitty(remote)) return json(res, 404, { ok: false, error: 'Session not found.' });
        const recordings = await anchorRequest(`/sessions/${encodeURIComponent(sessionId)}/recordings`);
        const items = Array.isArray(recordings?.items) ? recordings.items : [];
        const recording = items.find((item) => item?.is_primary) || items[0];
        if (!recording?.file_link) return json(res, 404, { ok: false, error: 'Recording is not ready yet.' });
        return json(res, 200, {
          ok: true,
          recording: {
            sessionId,
            url: recording.file_link,
            duration: recording.duration || null,
            createdAt: recording.created_at || null,
          },
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/session/restore') {
        const input = await bodyJson(req);
        const clientId = String(input.clientId || SESSION_USER).slice(0, 100);
        const session = await restoreFacebookSession(clientId, input.session || {}, anchorRequest);
        return json(res, 200, { ok: true, session: sessionPayload(session) });
      }

      if (req.method === 'POST' && url.pathname === '/api/session') {
        const input = await bodyJson(req);
        const clientId = String(input.clientId || crypto.randomUUID()).slice(0, 100);
        const forceNew = input.forceNew === true || input.replace === true;
        const session = forceNew
          ? await createFacebookSession(clientId, input.cookies, anchorRequest, prepareFacebookSession)
          : await getOrCreateSession(clientId, input.cookies, input.session, anchorRequest, prepareFacebookSession);
        return json(res, 200, { ok: true, session: sessionPayload(session) });
      }

      if (req.method === 'DELETE' && url.pathname === '/api/session') {
        const input = await bodyJson(req);
        const clientId = String(input.clientId || SESSION_USER);
        const record = await restoreFacebookSession(clientId, input.session || {}, anchorRequest);
        if (record) await closeSession(record, anchorRequest);
        return json(res, 200, { ok: true });
      }

      if (req.method === 'POST' && url.pathname === '/api/session/agent') {
        const input = await bodyJson(req);
        const clientId = String(input.clientId || SESSION_USER);
        const action = String(input.action || '').toLowerCase();
        if (!['pause', 'resume'].includes(action)) return json(res, 400, { ok: false, error: 'Choose pause or resume.' });
        const record = await restoreFacebookSession(clientId, input.session || {}, anchorRequest);
        if (!record) return json(res, 404, { ok: false, error: 'The live browser session is no longer available.' });
        const result = await anchorRequest(`/sessions/${encodeURIComponent(record.sessionId)}/agent/${action}`, { method: 'POST' });
        return json(res, 200, { ok: true, action, status: result?.status || action });
      }

      if (req.method === 'POST' && url.pathname === '/api/preview') {
        const input = await bodyJson(req);
        const prompt = String(input.prompt || '').trim();
        const intent = classifyIntent(prompt);
        if (!prompt) return json(res, 400, { ok: false, error: 'Write a request first.' });
        return json(res, 200, { ok: true, prompt, ...intent });
      }

      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const input = await bodyJson(req);
        const message = String(input.message || '').trim();
        if (!message) return json(res, 400, { ok: false, error: 'Write a message first.' });
        const requestContext = facebookContextForRequest(message);
        let decision = toolInventoryDecision(message, input.history)
          || await agentResponder(message.slice(0, 4000), input.history, requestContext);
        if (isAgentConversation(message)) {
          decision.mode = 'chat';
          decision.actionPrompt = '';
          const activePrompt = String(input.activeWorkflow?.prompt || '').trim();
          if (activePrompt) decision.reply = `I’m currently working on this in the same browser session: ${activePrompt}`;
        } else if (canResolveWithFacebookContext(message) && asksForMissingDetail(decision)) {
          decision = applyContextualAutonomy(message, decision);
        } else if (shouldClarifyBeforeAction(decision)) {
          decision = { ...decision, mode: 'chat', actionPrompt: '' };
        }
        return json(res, 200, { ok: true, ...decision });
      }

      if (req.method === 'POST' && url.pathname === '/api/run') {
        const input = await bodyJson(req);
        const prompt = String(input.prompt || '').trim();
        const clientId = String(input.clientId || '').trim();
        const intent = classifyIntent(prompt);
        if (!prompt || !clientId) return json(res, 400, { ok: false, error: 'Missing request or browser session.' });
        if (intent.needsConfirmation && input.confirmed !== true) return json(res, 409, { ok: false, needsConfirmation: true, prompt, ...intent });
        const session = await getOrCreateSession(clientId, input.cookies, input.session, anchorRequest, prepareFacebookSession);
        const task = await runTask(session, prompt, input.history, anchorRequest);
        return json(res, 200, { ok: true, task, session: { sessionId: session.sessionId, liveViewUrl: session.liveViewUrl, authenticated: session.authenticated } });
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/task/')) {
        const workflowId = decodeURIComponent(url.pathname.slice('/api/task/'.length));
        const status = await anchorRequest(`/tools/perform-web-task/${encodeURIComponent(workflowId)}/status`);
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
