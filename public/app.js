const $ = (selector) => document.querySelector(selector);

function readStoredJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

const state = {
  accessKey: sessionStorage.getItem('anchor-access-key') || '',
  clientId: localStorage.getItem('anchor-client-id') || crypto.randomUUID(),
  session: null,
  pendingPrompt: localStorage.getItem('anchor-pending-prompt') || '',
  workflowId: null,
  history: readStoredJSON('anchor-chat-history', []),
  workflow: readStoredJSON('anchor-active-workflow', null),
  actionQueue: readStoredJSON('anchor-action-queue', []),
  cookies: localStorage.getItem('anchor-facebook-cookies') || '',
  storedSession: readStoredJSON('anchor-active-session', null),
  mobileView: localStorage.getItem('anchor-mobile-view') || 'chat',
  browserCollapsed: localStorage.getItem('anchor-browser-collapsed') === 'true',
  draft: localStorage.getItem('anchor-chat-draft') || '',
  sessionHistory: [],
  replay: null,
};
if (!Array.isArray(state.history)) state.history = [];
if (!Array.isArray(state.actionQueue)) state.actionQueue = [];
localStorage.setItem('anchor-client-id', state.clientId);

const unlockDialog = $('#unlock-dialog');
const confirmDialog = $('#confirm-dialog');
const connection = $('#connection');
const browserStage = $('#browser-stage');
const browserEmpty = $('#browser-empty');
const liveBrowser = $('#live-browser');
const sessionReplay = $('#session-replay');
const messages = $('#messages');
const promptInput = $('#prompt');
const CLIENT_IDLE_CLOSE_MS = 30 * 60 * 1000;
let idleCloseTimer = null;

function persistHistory() {
  state.history = state.history.slice(-30);
  localStorage.setItem('anchor-chat-history', JSON.stringify(state.history));
}

function persistQueue() {
  localStorage.setItem('anchor-action-queue', JSON.stringify(state.actionQueue));
}

function savePendingPrompt(prompt = '') {
  state.pendingPrompt = String(prompt || '');
  if (state.pendingPrompt) localStorage.setItem('anchor-pending-prompt', state.pendingPrompt);
  else localStorage.removeItem('anchor-pending-prompt');
}

function saveWorkflow(workflow) {
  state.workflow = workflow;
  state.workflowId = workflow?.workflowId || null;
  if (workflow) localStorage.setItem('anchor-active-workflow', JSON.stringify(workflow));
  else localStorage.removeItem('anchor-active-workflow');
  $('#close-session').disabled = Boolean(workflow);
  if (workflow) clearTimeout(idleCloseTimer);
  else armIdleClose();
}

function setStatus(label, mode = '') {
  connection.className = `connection ${mode}`.trim();
  connection.querySelector('b').textContent = label;
  connection.title = label;
  connection.setAttribute('aria-label', label);
}

function addMessage(text, role = 'assistant', error = false, track = true) {
  const node = document.createElement('div');
  node.className = `message ${role}${error ? ' error' : ''}`;
  const avatar = document.createElement('span');
  avatar.textContent = role === 'user' ? 'YOU' : 'AB';
  const bubble = document.createElement('p');
  bubble.textContent = text;
  node.append(avatar, bubble);
  messages.append(node);
  messages.scrollTop = messages.scrollHeight;
  if (track && !error) {
    state.history.push({ role, text });
    persistHistory();
  }
  return bubble;
}

function rememberAssistant(text) {
  state.history.push({ role: 'assistant', text });
  persistHistory();
}

function renderStoredHistory() {
  for (const item of state.history) addMessage(item.text, item.role, false, false);
}

function setMobileView(view) {
  const next = view === 'browser' ? 'browser' : 'chat';
  state.mobileView = next;
  localStorage.setItem('anchor-mobile-view', next);
  document.body.dataset.mobileView = next;
  document.querySelectorAll('[data-mobile-view]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.mobileView === next));
  });
}

function setBrowserCollapsed(collapsed) {
  state.browserCollapsed = Boolean(collapsed);
  localStorage.setItem('anchor-browser-collapsed', String(state.browserCollapsed));
  browserStage.classList.toggle('collapsed', state.browserCollapsed);
  $('#toggle-browser').textContent = state.browserCollapsed ? 'Show view' : 'Hide view';
  $('#toggle-browser').setAttribute('aria-expanded', String(!state.browserCollapsed));
}

function restorePendingConfirmation() {
  if (!state.pendingPrompt || state.workflowId || confirmDialog.open) return;
  $('#confirm-prompt').textContent = state.pendingPrompt;
  confirmDialog.returnValue = '';
  confirmDialog.showModal();
  setStatus('Waiting for confirmation');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-access-key': state.accessKey,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function clearReplay() {
  state.replay = null;
  sessionReplay.pause();
  sessionReplay.removeAttribute('src');
  sessionReplay.load();
  sessionReplay.hidden = true;
  $('#return-live').hidden = true;
}

function clearSessionView() {
  clearTimeout(idleCloseTimer);
  clearReplay();
  state.session = null;
  state.storedSession = null;
  state.workflowId = null;
  saveWorkflow(null);
  state.actionQueue = [];
  persistQueue();
  localStorage.removeItem('anchor-active-session');
  liveBrowser.src = 'about:blank';
  $('#open-live').href = '#';
  $('#open-live').textContent = 'Open full screen';
  $('#open-live').hidden = true;
  liveBrowser.hidden = true;
  browserEmpty.hidden = false;
  $('#close-session').hidden = true;
  $('#session-state').textContent = 'Session off';
  setStatus('Ready');
}

function showSession(session, restored = false) {
  clearReplay();
  state.session = session;
  state.storedSession = session;
  localStorage.setItem('anchor-active-session', JSON.stringify(session));
  liveBrowser.src = session.liveViewUrl;
  $('#open-live').href = session.liveViewUrl;
  $('#open-live').textContent = 'Open full screen';
  $('#open-live').hidden = false;
  liveBrowser.hidden = false;
  browserEmpty.hidden = true;
  $('#close-session').hidden = false;
  $('#session-state').textContent = restored ? 'Existing session restored' : (session.authenticated ? 'Facebook connected' : 'Login available in live view');
  setStatus(session.authenticated ? 'Facebook live' : 'Browser live', 'live');
  armIdleClose();
}

function formatSessionDate(value) {
  if (!value) return 'Earlier session';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  if (!total) return '';
  if (total < 60) return `${Math.round(total)} sec`;
  if (total < 3600) return `${Math.round(total / 60)} min`;
  return `${Math.round(total / 360) / 10} hr`;
}

function renderSessionHistory() {
  const list = $('#session-history-list');
  list.replaceChildren();
  $('#history-count').textContent = String(state.sessionHistory.length);
  if (!state.sessionHistory.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'No Anchor sessions yet.';
    list.append(empty);
    return;
  }
  for (const session of state.sessionHistory) {
    const row = document.createElement('div');
    row.className = 'history-item';
    if (session.sessionId === state.session?.sessionId) row.classList.add('current');
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = formatSessionDate(session.createdAt);
    const detail = document.createElement('small');
    const duration = formatDuration(session.duration);
    detail.textContent = session.status === 'running'
      ? (session.sessionId === state.session?.sessionId ? 'Live now · current' : 'Live now')
      : `Recorded${duration ? ` · ${duration}` : ''}`;
    copy.append(title, detail);
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'history-open';
    action.textContent = session.status === 'running' ? 'Open' : 'Replay';
    action.addEventListener('click', async () => {
      action.disabled = true;
      try {
        if (session.status === 'running') await restoreSession(session);
        else await showReplay(session);
        $('#session-history').open = false;
        setMobileView('browser');
      } catch (error) {
        addMessage(error.message, 'assistant', true);
      } finally {
        action.disabled = false;
      }
    });
    row.append(copy, action);
    list.append(row);
  }
}

async function loadSessionHistory(autoload = false) {
  const payload = await api('/api/sessions');
  state.sessionHistory = Array.isArray(payload.sessions) ? payload.sessions : [];
  $('#history-user').textContent = payload.user || 'kittyfb';
  $('#history-note').textContent = `Saved by Anchor · hidden sessions stop after ${payload.idleMinutes || 15} minutes disconnected.`;
  renderSessionHistory();
  if (!autoload || state.session) return payload;
  const stored = state.sessionHistory.find((item) => item.status === 'running' && item.sessionId === state.storedSession?.sessionId);
  const candidate = stored || payload.activeSession;
  if (!candidate) return payload;
  const exact = stored && state.storedSession?.liveViewUrl
    ? { ...candidate, ...state.storedSession, status: candidate.status }
    : candidate;
  await restoreSession(exact);
  return payload;
}

async function showReplay(session) {
  setStatus('Loading replay…', 'busy');
  const payload = await api(`/api/sessions/${encodeURIComponent(session.sessionId)}/recording`);
  clearReplay();
  state.replay = session;
  liveBrowser.hidden = true;
  browserEmpty.hidden = true;
  sessionReplay.src = payload.recording.url;
  sessionReplay.hidden = false;
  $('#open-live').href = payload.recording.url;
  $('#open-live').textContent = 'Open recording';
  $('#open-live').hidden = false;
  $('#return-live').hidden = false;
  $('#session-state').textContent = `Replay · ${formatSessionDate(session.createdAt)}`;
  setStatus('Replay');
  void sessionReplay.play().catch(() => {});
}

async function loadDefaultCookies() {
  if (state.cookies) return;
  const payload = await api('/api/defaults');
  if (!payload.cookies) return;
  const parsed = JSON.parse(payload.cookies);
  if (!Array.isArray(parsed)) return;
  state.cookies = JSON.stringify(parsed);
  localStorage.setItem('anchor-facebook-cookies', state.cookies);
}

async function restoreSession(candidate = state.storedSession) {
  if (!candidate?.sessionId) return null;
  const payload = await api('/api/session/restore', {
    method: 'POST',
    body: JSON.stringify({ clientId: state.clientId, session: candidate }),
  });
  if (!payload.session) {
    if (candidate.sessionId === state.storedSession?.sessionId) clearSessionView();
    return null;
  }
  showSession(payload.session, true);
  renderSessionHistory();
  addMessage('Your existing Anchor browser session is open again. Continue chatting normally; older sessions stay tucked inside History.', 'assistant', false, false);
  return payload.session;
}

async function startSession(forceNew = false) {
  if (!state.cookies) {
    $('#cookies-dialog').showModal();
    throw new Error('Paste your Facebook cookies before starting a session.');
  }
  setStatus('Starting…', 'busy');
  $('#start-session').disabled = true;
  $('#new-session').disabled = true;
  try {
    const keepCurrent = Boolean(forceNew && state.workflowId && state.session);
    const payload = await api('/api/session', {
      method: 'POST',
      body: JSON.stringify({ clientId: state.clientId, cookies: state.cookies, forceNew, session: state.storedSession }),
    });
    if (!keepCurrent) showSession(payload.session);
    await loadSessionHistory(false);
    addMessage(keepCurrent
      ? 'A parallel browser session was created and saved in History. The current working session stays in the main view until its task finishes.'
      : (payload.session.authenticated
        ? 'Your Facebook browser is live. Send me a request below.'
        : 'The browser is live with your saved cookies and persistent Anchor profile. If Facebook asks, finish login or two-factor verification in the live view.'));
    return keepCurrent ? state.session : payload.session;
  } catch (error) {
    setStatus('Could not start');
    addMessage(error.message, 'assistant', true);
    throw error;
  } finally {
    $('#start-session').disabled = false;
    $('#new-session').disabled = false;
  }
}

async function closeSession(reason = 'manual') {
  if (!state.session) return;
  if (state.workflowId) {
    if (reason === 'inactive') return armIdleClose();
    addMessage('The current browser task is still running, so I kept its session open. You can create a parallel session from History.', 'assistant');
    return;
  }
  const closedId = state.session.sessionId;
  await api('/api/session', { method: 'DELETE', body: JSON.stringify({ clientId: state.clientId, session: state.session }) }).catch(() => {});
  clearSessionView();
  await loadSessionHistory(false).catch(() => {});
  state.sessionHistory = state.sessionHistory.filter((item) => item.sessionId !== closedId);
  renderSessionHistory();
  await loadSessionHistory(true).catch(() => {});
  if (reason === 'inactive') addMessage('The inactive browser session was stopped. Its recording remains under History.', 'assistant');
}

async function ensureSession() {
  if (state.session) return state.session;
  await loadSessionHistory(true);
  if (state.session) return state.session;
  return startSession(false);
}

function armIdleClose() {
  clearTimeout(idleCloseTimer);
  if (!state.session || state.workflowId) return;
  idleCloseTimer = setTimeout(() => void closeSession('inactive'), CLIENT_IDLE_CLOSE_MS);
}

function readTaskResult(statusPayload) {
  const data = statusPayload?.data || statusPayload || {};
  const status = String(data.status || '').toUpperCase();
  const result = data.result || data.output || data.final_response || data.message || '';
  const error = data.error || data.error_message || '';
  return { status, result: typeof result === 'string' ? result : JSON.stringify(result, null, 2), error: typeof error === 'string' ? error : JSON.stringify(error) };
}

async function pollTask(workflowId, bubble) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const payload = await api(`/api/task/${encodeURIComponent(workflowId)}`);
    const task = readTaskResult(payload.status);
    if (['COMPLETED', 'COMPLETE', 'SUCCEEDED', 'SUCCESS'].includes(task.status)) {
      bubble.textContent = task.result || 'The browser task completed. You can inspect the final page in the live view.';
      rememberAssistant(bubble.textContent);
      saveWorkflow(null);
      setStatus('Facebook live', 'live');
      void runNextAction();
      return;
    }
    if (['FAILED', 'ERROR', 'CANCELLED'].includes(task.status)) {
      bubble.textContent = task.error || task.result || 'The browser task failed.';
      bubble.parentElement.classList.add('error');
      rememberAssistant(bubble.textContent);
      saveWorkflow(null);
      setStatus('Task failed');
      void runNextAction();
      return;
    }
    if (/WAIT|PAUSED|HUMAN|INTERVENTION|INPUT/.test(task.status)) {
      bubble.textContent = 'The browser agent needs your input. Open the Live browser view, complete the requested login, verification, CAPTCHA, or field, and leave the page open so the agent can continue.';
      setStatus('Input needed', 'busy');
      setMobileView('browser');
      continue;
    }
    bubble.textContent = `Working in the live browser… ${task.status ? `(${task.status.toLowerCase()})` : ''}`;
  }
  bubble.textContent = 'The task is still running in the live browser.';
  setStatus('Still working', 'busy');
}

async function runNextAction() {
  if (state.workflowId || !state.actionQueue.length) return;
  const next = state.actionQueue.shift();
  persistQueue();
  addMessage('Continuing with the next queued request in the same browser session.', 'assistant');
  await execute(next.prompt, next.confirmed);
}

async function execute(prompt, confirmed = false) {
  if (state.workflowId) {
    state.actionQueue.push({ prompt, confirmed });
    persistQueue();
    addMessage('I’m already working in this browser. I queued that request and will continue in the same session when the current action finishes.');
    return;
  }
  await ensureSession();
  setStatus('Working…', 'busy');
  const bubble = addMessage('Starting the browser agent in your current session…', 'assistant', false, false);
  try {
    const payload = await api('/api/run', {
      method: 'POST',
      body: JSON.stringify({ clientId: state.clientId, prompt, confirmed, history: state.history.slice(-12), cookies: state.cookies, session: state.session }),
    });
    if (payload.session?.liveViewUrl && liveBrowser.src !== payload.session.liveViewUrl) liveBrowser.src = payload.session.liveViewUrl;
    if (payload.task.workflowId) {
      saveWorkflow({ workflowId: payload.task.workflowId, prompt, confirmed, sessionId: state.session?.sessionId || '' });
      await pollTask(payload.task.workflowId, bubble);
    } else {
      bubble.textContent = payload.task.result || 'The browser task completed.';
      rememberAssistant(bubble.textContent);
      setStatus('Facebook live', 'live');
      void runNextAction();
    }
  } catch (error) {
    bubble.textContent = error.message;
    bubble.parentElement.classList.add('error');
    saveWorkflow(null);
    setStatus('Task failed');
    void runNextAction();
  }
}

async function submitPrompt(prompt) {
  addMessage(prompt, 'user');
  if (await handleCommand(prompt)) return;
  setStatus('Thinking…', 'busy');
  const conversationHistory = state.history.slice(0, -1).slice(-10);
  const agent = await api('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message: prompt, history: conversationHistory, activeWorkflow: state.workflow }),
  });
  addMessage(agent.reply);
  if (agent.mode !== 'action') {
    setStatus(state.session ? 'Browser live' : 'Ready', state.session ? 'live' : '');
    return;
  }
  const actionPrompt = agent.actionPrompt || prompt;
  const preview = await api('/api/preview', { method: 'POST', body: JSON.stringify({ prompt: actionPrompt }) });
  if (preview.needsConfirmation) {
    savePendingPrompt(actionPrompt);
    $('#confirm-prompt').textContent = actionPrompt;
    confirmDialog.returnValue = '';
    confirmDialog.showModal();
    setStatus('Waiting for confirmation');
    return;
  }
  await execute(actionPrompt, false);
}

async function handleCommand(prompt) {
  const command = prompt.trim().toLowerCase();
  if (!command.startsWith('/')) return false;
  if (command === '/chat') {
    setMobileView('chat');
    addMessage('Agent chat is open. Keep talking to me normally.');
    setStatus(state.session ? 'Browser live' : 'Ready', state.session ? 'live' : '');
    return true;
  }
  if (command === '/browser') {
    await ensureSession();
    setMobileView('browser');
    addMessage('The same live browser session is open. You can type, click, finish login, or complete verification there, then return to chat.');
    return true;
  }
  if (command === '/cookies') {
    $('#open-cookies').click();
    addMessage('Cookie settings are open. Saved cookies are injected whenever a new Anchor session is created.');
    return true;
  }
  if (command === '/new') {
    await startSession(true);
    setMobileView('browser');
    return true;
  }
  if (command === '/session') {
    addMessage(state.session
      ? 'The agent is using the current primary kittyfb session. Use /browser to interact with it; /new creates a parallel cookie-backed session and older sessions stay under History.'
      : 'No browser is running yet. I’ll restore the newest active kittyfb session from Anchor, or create one with the saved cookies.');
    return true;
  }
  addMessage('Unknown command. Use /browser, /chat, /cookies, /new, or /session.');
  return true;
}

$('#composer').addEventListener('submit', async (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) return;
  promptInput.value = '';
  state.draft = '';
  localStorage.removeItem('anchor-chat-draft');
  try { await submitPrompt(prompt); } catch (error) {
    if (error.status === 401) unlockDialog.showModal();
    else addMessage(error.message, 'assistant', true);
  }
});

promptInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    $('#composer').requestSubmit();
  }
});

promptInput.addEventListener('input', () => {
  state.draft = promptInput.value;
  if (state.draft) localStorage.setItem('anchor-chat-draft', state.draft);
  else localStorage.removeItem('anchor-chat-draft');
});

document.querySelectorAll('[data-prompt]').forEach((button) => {
  button.addEventListener('click', () => {
    promptInput.value = button.dataset.prompt;
    state.draft = promptInput.value;
    localStorage.setItem('anchor-chat-draft', state.draft);
    promptInput.focus();
  });
});

document.querySelectorAll('[data-command]').forEach((button) => {
  button.addEventListener('click', () => {
    promptInput.value = button.dataset.command;
    $('#composer').requestSubmit();
  });
});

document.querySelectorAll('[data-mobile-view]').forEach((button) => {
  button.addEventListener('click', () => setMobileView(button.dataset.mobileView));
});

$('#start-session').addEventListener('click', () => startSession(false));
$('#new-session').addEventListener('click', () => startSession(true));
$('#close-session').addEventListener('click', () => closeSession('manual'));
$('#return-live').addEventListener('click', () => {
  if (state.session) showSession(state.session, true);
  else clearSessionView();
});
$('#session-history').addEventListener('toggle', (event) => {
  if (event.currentTarget.open && state.accessKey) void loadSessionHistory(false).catch((error) => addMessage(error.message, 'assistant', true));
});
$('#open-cookies').addEventListener('click', () => {
  $('#cookies-json').value = state.cookies;
  $('#cookie-status').textContent = state.cookies ? 'Cookies saved on this device.' : 'Required: c_user, xs, datr and sb';
  $('#cookie-status').className = `cookie-status ${state.cookies ? 'good' : ''}`;
  $('#cookies-dialog').showModal();
});
$('#toggle-browser').addEventListener('click', (event) => {
  setBrowserCollapsed(!state.browserCollapsed);
});

$('#confirm-run').addEventListener('click', () => {
  const prompt = state.pendingPrompt;
  savePendingPrompt('');
  if (prompt) execute(prompt, true);
});

confirmDialog.addEventListener('close', () => {
  if (confirmDialog.returnValue !== 'confirm') savePendingPrompt('');
});

$('#unlock-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  state.accessKey = $('#access-key').value;
  try {
    await api('/api/preview', { method: 'POST', body: JSON.stringify({ prompt: 'Open Facebook notifications and summarize them.' }) });
    sessionStorage.setItem('anchor-access-key', state.accessKey);
    $('#unlock-error').textContent = '';
    unlockDialog.close();
    setStatus('Ready');
    await loadDefaultCookies();
    await loadSessionHistory(true);
    void resumeWorkflow();
    restorePendingConfirmation();
  } catch (error) {
    $('#unlock-error').textContent = error.status === 401 ? 'That access key is not correct.' : error.message;
  }
});

$('#cookies-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = $('#cookie-status');
  try {
    const value = $('#cookies-json').value.trim();
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('Paste a JSON array of cookies.');
    const names = new Set(parsed.map((cookie) => cookie?.name));
    const missing = ['c_user', 'xs', 'datr', 'sb'].filter((name) => !names.has(name));
    if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`);
    state.cookies = JSON.stringify(parsed);
    localStorage.setItem('anchor-facebook-cookies', state.cookies);
    status.textContent = state.session
      ? `${parsed.length} cookies saved. They will be injected into the next new session; the current session stays unchanged.`
      : `${parsed.length} cookies saved on this device. They will be injected when the session is created.`;
    status.className = 'cookie-status good';
    setTimeout(() => $('#cookies-dialog').close(), 350);
  } catch (error) {
    status.textContent = error.message;
    status.className = 'cookie-status bad';
  }
});

async function boot() {
  promptInput.value = state.draft;
  setMobileView(state.mobileView);
  setBrowserCollapsed(state.browserCollapsed);
  renderStoredHistory();
  if (!state.accessKey) {
    unlockDialog.showModal();
    return;
  }
  setStatus('Ready');
  try {
    await loadDefaultCookies();
    await loadSessionHistory(true);
    void resumeWorkflow();
    restorePendingConfirmation();
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem('anchor-access-key');
      state.accessKey = '';
      unlockDialog.showModal();
    } else {
      clearSessionView();
      addMessage(error.message, 'assistant', true);
    }
  }
}

for (const eventName of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(eventName, armIdleClose, { passive: true });
}

function resumeWorkflow() {
  if (!state.workflow?.workflowId || state.workflowId) return;
  saveWorkflow(state.workflow);
  const bubble = addMessage('Reconnected to the browser agent. It is continuing in the same session…', 'assistant', false, false);
  void pollTask(state.workflow.workflowId, bubble);
}

boot();
