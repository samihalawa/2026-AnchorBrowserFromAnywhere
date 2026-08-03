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
  historyExpanded: false,
  taskPaused: Boolean(readStoredJSON('anchor-active-workflow', null)?.paused),
  browserShare: Math.min(75, Math.max(45, Number(localStorage.getItem('anchor-browser-share') || 65))),
  attachments: [],
};
if (!Array.isArray(state.history)) state.history = [];
if (!Array.isArray(state.actionQueue)) state.actionQueue = [];
localStorage.setItem('anchor-client-id', state.clientId);

const unlockDialog = $('#unlock-dialog');
const connection = $('#connection');
const browserStage = $('#browser-stage');
const browserEmpty = $('#browser-empty');
const liveBrowser = $('#live-browser');
const sessionReplay = $('#session-replay');
const messages = $('#messages');
const promptInput = $('#prompt');
const mediaInput = $('#media-input');
const attachmentList = $('#attachment-list');
const CLIENT_IDLE_CLOSE_MS = 30 * 60 * 1000;
const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
let idleCloseTimer = null;
let wakeLock = null;
let wakeLockRequest = null;

function persistHistory() {
  state.history = state.history.slice(-30);
  localStorage.setItem('anchor-chat-history', JSON.stringify(state.history));
}

function persistQueue() {
  localStorage.setItem('anchor-action-queue', JSON.stringify(state.actionQueue));
}

function saveWorkflow(workflow) {
  state.workflow = workflow;
  state.workflowId = workflow?.workflowId || null;
  state.taskPaused = Boolean(workflow?.paused);
  if (workflow) localStorage.setItem('anchor-active-workflow', JSON.stringify(workflow));
  else localStorage.removeItem('anchor-active-workflow');
  $('#close-session').disabled = Boolean(workflow);
  updateTaskControls();
  if (workflow) clearTimeout(idleCloseTimer);
  else armIdleClose();
}

function setStatus(label, mode = '') {
  const normalized = String(label).toLowerCase();
  const resolvedMode = mode
    || (/replay/.test(normalized) ? 'replay'
      : (/failed|could not|error/.test(normalized) ? 'error'
        : (/waiting|input needed|paused/.test(normalized) ? 'attention'
          : (/working|thinking|starting|loading|restoring/.test(normalized) ? 'busy'
            : (/live/.test(normalized) ? 'live' : '')))));
  connection.className = `connection ${resolvedMode}`.trim();
  connection.querySelector('b').textContent = label;
  connection.title = label;
  connection.setAttribute('aria-label', label);
}

function updateTaskControls() {
  const control = $('#stop-task');
  control.hidden = !state.workflowId;
  control.textContent = state.taskPaused ? 'Resume task' : 'Stop task';
  control.setAttribute('aria-label', state.taskPaused ? 'Resume browser task' : 'Stop browser task');
}

function setStageLoading(visible, label = 'Opening your browser…') {
  $('#stage-loading-label').textContent = label;
  $('#stage-loading').hidden = !visible;
}

function setBrowserShare(value) {
  state.browserShare = Math.min(75, Math.max(45, Number(value) || 65));
  localStorage.setItem('anchor-browser-share', String(state.browserShare));
  $('#workspace').style.setProperty('--browser-fr', `${state.browserShare}fr`);
  $('#workspace').style.setProperty('--chat-fr', `${100 - state.browserShare}fr`);
  $('#workspace-resizer').setAttribute('aria-valuenow', String(Math.round(state.browserShare)));
}

function resizeComposer() {
  promptInput.style.height = 'auto';
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 160)}px`;
}

function clearAttachments() {
  for (const attachment of state.attachments) URL.revokeObjectURL(attachment.url);
  state.attachments = [];
  mediaInput.value = '';
  renderAttachments();
}

function removeAttachment(id) {
  const attachment = state.attachments.find((item) => item.id === id);
  if (attachment) URL.revokeObjectURL(attachment.url);
  state.attachments = state.attachments.filter((item) => item.id !== id);
  renderAttachments();
}

function renderAttachments() {
  attachmentList.replaceChildren();
  attachmentList.hidden = state.attachments.length === 0;
  for (const attachment of state.attachments) {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';
    if (attachment.file.type.startsWith('image/')) {
      const preview = document.createElement('img');
      preview.src = attachment.url;
      preview.alt = attachment.file.name;
      chip.append(preview);
    } else {
      const label = document.createElement('span');
      label.className = 'video-label';
      label.textContent = attachment.file.name;
      chip.append(label);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${attachment.file.name}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => removeAttachment(attachment.id));
    chip.append(remove);
    attachmentList.append(chip);
  }
}

function addAttachments(files) {
  const accepted = [...files].filter((file) => /^(image|video)\//i.test(file.type));
  const tooLarge = accepted.find((file) => file.size > MAX_ATTACHMENT_BYTES);
  if (tooLarge) throw new Error(`${tooLarge.name} is larger than 20 MB.`);
  const remaining = MAX_ATTACHMENTS - state.attachments.length;
  if (accepted.length > remaining) throw new Error(`Choose no more than ${MAX_ATTACHMENTS} photos or videos at once.`);
  state.attachments.push(...accepted.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) })));
  renderAttachments();
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
  void syncWakeLock();
}

function setBrowserCollapsed(collapsed) {
  state.browserCollapsed = Boolean(collapsed);
  localStorage.setItem('anchor-browser-collapsed', String(state.browserCollapsed));
  browserStage.classList.toggle('collapsed', state.browserCollapsed);
  $('#toggle-browser').textContent = state.browserCollapsed ? 'Show view' : 'Hide view';
  $('#toggle-browser').setAttribute('aria-expanded', String(!state.browserCollapsed));
  void syncWakeLock();
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function updateFullscreenControls() {
  const active = fullscreenElement() === browserStage;
  $('#stage-fullscreen').textContent = active ? 'Exit full screen' : 'Full screen';
  if (!state.replay) $('#open-live').innerHTML = active
    ? 'Exit full screen'
    : 'Full screen <span aria-hidden="true">↗</span>';
}

async function toggleStageFullscreen() {
  if (fullscreenElement()) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) await exit.call(document);
    return;
  }
  const request = browserStage.requestFullscreen
    ? () => browserStage.requestFullscreen({ navigationUI: 'hide' })
    : (browserStage.webkitRequestFullscreen ? () => browserStage.webkitRequestFullscreen() : null);
  if (request) {
    try {
      await request();
      return;
    } catch {
      // A new-tab live view remains available when a browser rejects fullscreen.
    }
  }
  const url = state.replay ? sessionReplay.currentSrc : state.session?.liveViewUrl;
  if (url) window.open(url, '_blank', 'noopener');
}

function reconnectLiveView() {
  const url = state.session?.liveViewUrl;
  if (!url || state.replay) return;
  setStageLoading(true, 'Reconnecting the live view…');
  liveBrowser.src = 'about:blank';
  requestAnimationFrame(() => {
    liveBrowser.src = url;
  });
}

function shouldKeepScreenAwake() {
  return Boolean(
    state.session
    && state.mobileView === 'browser'
    && !state.browserCollapsed
    && document.visibilityState === 'visible'
    && window.matchMedia('(max-width: 47.99rem)').matches
  );
}

async function syncWakeLock() {
  if (!shouldKeepScreenAwake()) {
    if (wakeLock) await wakeLock.release().catch(() => {});
    wakeLock = null;
    return;
  }
  if (!navigator.wakeLock?.request || wakeLock || wakeLockRequest) return;
  wakeLockRequest = navigator.wakeLock.request('screen');
  try {
    const requestedLock = await wakeLockRequest;
    if (!shouldKeepScreenAwake()) {
      await requestedLock.release().catch(() => {});
      return;
    }
    wakeLock = requestedLock;
    wakeLock.addEventListener('release', () => { wakeLock = null; }, { once: true });
  } catch {
    wakeLock = null;
  } finally {
    wakeLockRequest = null;
  }
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

async function uploadApi(path, form) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'x-access-key': state.accessKey },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Upload failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function uploadAttachments(attachments) {
  await ensureSession();
  const form = new FormData();
  form.append('clientId', state.clientId);
  form.append('sessionId', state.session.sessionId);
  form.append('liveViewUrl', state.session.liveViewUrl);
  for (const attachment of attachments) form.append('files', attachment.file, attachment.file.name);
  const payload = await uploadApi('/api/session/files', form);
  return payload.resources || [];
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
  $('#open-live').innerHTML = 'Full screen <span aria-hidden="true">↗</span>';
  $('#open-live').hidden = true;
  $('#stage-controls').hidden = true;
  $('#refresh-live-view').hidden = false;
  liveBrowser.hidden = true;
  browserEmpty.hidden = false;
  $('#close-session').hidden = true;
  $('#session-state').textContent = 'Session off';
  setStageLoading(false);
  setStatus('Ready');
  void syncWakeLock();
}

function showSession(session, restored = false) {
  clearReplay();
  state.session = session;
  state.storedSession = session;
  localStorage.setItem('anchor-active-session', JSON.stringify(session));
  if (liveBrowser.src !== session.liveViewUrl) {
    setStageLoading(true, restored ? 'Restoring your browser…' : 'Opening your browser…');
    liveBrowser.src = session.liveViewUrl;
  } else setStageLoading(false);
  $('#open-live').href = session.liveViewUrl;
  $('#open-live').innerHTML = 'Full screen <span aria-hidden="true">↗</span>';
  $('#open-live').hidden = false;
  $('#stage-controls').hidden = false;
  $('#refresh-live-view').hidden = false;
  liveBrowser.hidden = false;
  browserEmpty.hidden = true;
  $('#close-session').hidden = false;
  $('#session-state').textContent = restored ? 'Existing session restored' : (session.authenticated ? 'Facebook connected' : 'Login available in live view');
  setStatus(session.authenticated ? 'Facebook live' : 'Browser live', 'live');
  updateFullscreenControls();
  void syncWakeLock();
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
  const toggle = $('#history-toggle-list');
  list.replaceChildren();
  $('#history-count').textContent = String(state.sessionHistory.length);
  if (!state.sessionHistory.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'No Anchor sessions yet.';
    list.append(empty);
    toggle.hidden = true;
    return;
  }
  const sorted = [...state.sessionHistory].sort((a, b) => {
    const aCurrent = a.sessionId === state.session?.sessionId ? 1 : 0;
    const bCurrent = b.sessionId === state.session?.sessionId ? 1 : 0;
    return bCurrent - aCurrent || Number(b.createdAt || 0) - Number(a.createdAt || 0);
  });
  const visibleSessions = state.historyExpanded ? sorted : sorted.slice(0, 5);
  toggle.hidden = sorted.length <= 5;
  toggle.textContent = state.historyExpanded ? 'Show recent only' : `View all ${sorted.length} sessions`;
  for (const session of visibleSessions) {
    const row = document.createElement('div');
    row.className = 'history-item';
    const isCurrent = session.sessionId === state.session?.sessionId;
    if (isCurrent) row.classList.add('current');
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = formatSessionDate(session.createdAt);
    const detail = document.createElement('small');
    const duration = formatDuration(session.duration);
    detail.textContent = session.status === 'running'
      ? 'Live now'
      : `Recorded${duration ? ` · ${duration}` : ''}`;
    const badge = document.createElement('span');
    badge.className = 'history-badge';
    badge.textContent = isCurrent ? 'Current' : (session.status === 'running' ? 'Live' : (session.recordingAvailable ? 'Recording' : 'Ended'));
    copy.append(title, detail, badge);
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
        setStageLoading(false);
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
  $('#history-user').textContent = payload.user || 'Facebook agent';
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
  setStageLoading(true, 'Loading session replay…');
  const payload = await api(`/api/sessions/${encodeURIComponent(session.sessionId)}/recording`);
  clearReplay();
  state.replay = session;
  liveBrowser.hidden = true;
  browserEmpty.hidden = true;
  sessionReplay.src = payload.recording.url;
  sessionReplay.hidden = false;
  $('#open-live').href = payload.recording.url;
  $('#open-live').innerHTML = 'Open recording <span aria-hidden="true">↗</span>';
  $('#open-live').hidden = false;
  $('#stage-controls').hidden = false;
  $('#refresh-live-view').hidden = true;
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
  setStageLoading(true, 'Restoring your browser…');
  const payload = await api('/api/session/restore', {
    method: 'POST',
    body: JSON.stringify({ clientId: state.clientId, session: candidate }),
  });
  if (!payload.session) {
    setStageLoading(false);
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
  setStageLoading(true, forceNew ? 'Creating a parallel browser…' : 'Creating your browser…');
  $('#start-session').disabled = true;
  $('#new-session').disabled = true;
  try {
    const keepCurrent = Boolean(forceNew && state.workflowId && state.session);
    const payload = await api('/api/session', {
      method: 'POST',
      body: JSON.stringify({ clientId: state.clientId, cookies: state.cookies, forceNew, session: state.storedSession }),
    });
    if (!keepCurrent) showSession(payload.session);
    else setStageLoading(false);
    await loadSessionHistory(false);
    addMessage(keepCurrent
      ? 'A parallel browser session was created and saved in History. The current working session stays in the main view until its task finishes.'
      : (payload.session.authenticated
        ? 'Your Facebook browser is live. Send me a request below.'
        : 'The browser is live with your saved cookies and persistent Anchor profile. If Facebook asks, finish login or two-factor verification in the live view.'));
    return keepCurrent ? state.session : payload.session;
  } catch (error) {
    setStageLoading(false);
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
    while (state.taskPaused && state.workflowId === workflowId) {
      setStatus('Task paused');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (state.workflowId !== workflowId) return;
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

async function toggleTaskPause() {
  if (!state.workflowId || !state.session) return;
  const button = $('#stop-task');
  const action = state.taskPaused ? 'resume' : 'pause';
  button.disabled = true;
  try {
    await api('/api/session/agent', {
      method: 'POST',
      body: JSON.stringify({ clientId: state.clientId, session: state.session, action }),
    });
    saveWorkflow({ ...state.workflow, paused: action === 'pause' });
    setStatus(action === 'pause' ? 'Task paused' : 'Working…', action === 'pause' ? 'attention' : 'busy');
    addMessage(action === 'pause'
      ? 'The browser task is stopped for now. The live session stays open; press Resume task when you want it to continue.'
      : 'The browser task is continuing in the same live session.', 'assistant');
  } catch (error) {
    addMessage(error.message, 'assistant', true);
  } finally {
    button.disabled = false;
  }
}

async function runNextAction() {
  if (state.workflowId || !state.actionQueue.length) return;
  const next = state.actionQueue.shift();
  persistQueue();
  addMessage('Continuing with the next queued request in the same browser session.', 'assistant');
  await execute(next.prompt);
}

async function execute(prompt) {
  if (state.workflowId) {
    state.actionQueue.push({ prompt });
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
      body: JSON.stringify({ clientId: state.clientId, prompt, history: state.history.slice(-12), cookies: state.cookies, session: state.session }),
    });
    if (payload.session?.liveViewUrl && liveBrowser.src !== payload.session.liveViewUrl) liveBrowser.src = payload.session.liveViewUrl;
    if (payload.task.workflowId) {
      saveWorkflow({ workflowId: payload.task.workflowId, prompt, sessionId: state.session?.sessionId || '' });
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
  const attachments = state.attachments.slice();
  const attachmentNames = attachments.map((item) => item.file.name);
  const displayPrompt = attachmentNames.length ? `${prompt}\n📎 ${attachmentNames.join(', ')}` : prompt;
  addMessage(displayPrompt, 'user');
  if (await handleCommand(prompt)) return;
  setStatus('Thinking…', 'busy');
  const conversationHistory = state.history.slice(0, -1).slice(-10);
  const controllerMessage = attachmentNames.length
    ? `${prompt}\n\nThe user attached these media files for this request: ${attachmentNames.join(', ')}. If this is a Facebook action, require the operating browser agent to use the attached media.`
    : prompt;
  const agent = await api('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message: controllerMessage, history: conversationHistory, activeWorkflow: state.workflow }),
  });
  addMessage(agent.reply);
  if (agent.mode !== 'action') {
    setStatus(state.session ? 'Browser live' : 'Ready', state.session ? 'live' : '');
    return;
  }
  let actionPrompt = agent.actionPrompt || prompt;
  if (attachments.length) {
    setStatus('Uploading media…', 'busy');
    const resources = await uploadAttachments(attachments);
    const paths = resources.map((resource) => resource.path).filter(Boolean);
    if (!paths.length) throw new Error('Anchor did not return an uploaded media path.');
    actionPrompt = `${actionPrompt}\nUse the user-attached Anchor resources in this session: ${paths.join(', ')}. These are the exact media files selected for this request.`;
    clearAttachments();
    addMessage(`${resources.length} media ${resources.length === 1 ? 'file is' : 'files are'} ready in the live browser.`, 'assistant', false, false);
  }
  await execute(actionPrompt);
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
      ? 'The agent is using the current primary session. Use /browser to interact with it; /new creates a parallel cookie-backed session and older sessions stay under History.'
      : 'No browser is running yet. I’ll restore the newest active session from Anchor, or create one with the saved cookies.');
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
  resizeComposer();
});

$('#attach-media').addEventListener('click', () => mediaInput.click());
mediaInput.addEventListener('change', () => {
  try { addAttachments(mediaInput.files || []); } catch (error) { addMessage(error.message, 'assistant', true); }
  mediaInput.value = '';
});

promptInput.addEventListener('paste', (event) => {
  const files = [...(event.clipboardData?.files || [])].filter((file) => /^(image|video)\//i.test(file.type));
  if (!files.length) return;
  event.preventDefault();
  try { addAttachments(files); } catch (error) { addMessage(error.message, 'assistant', true); }
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
$('#stop-task').addEventListener('click', toggleTaskPause);
$('#history-toggle-list').addEventListener('click', () => {
  state.historyExpanded = !state.historyExpanded;
  renderSessionHistory();
});
$('#quick-actions-more').addEventListener('click', () => {
  const shell = document.querySelector('.quick-actions-shell');
  const expanded = shell.classList.toggle('expanded');
  $('#quick-actions-more').textContent = expanded ? 'Less ↑' : 'More →';
  $('#quick-actions-more').setAttribute('aria-expanded', String(expanded));
});
$('#return-live').addEventListener('click', () => {
  if (state.session) showSession(state.session, true);
  else clearSessionView();
});
$('#session-history').addEventListener('toggle', (event) => {
  if (!event.currentTarget.open) state.historyExpanded = false;
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
$('#open-live').addEventListener('click', (event) => {
  if (browserStage.requestFullscreen || browserStage.webkitRequestFullscreen || fullscreenElement()) {
    event.preventDefault();
    void toggleStageFullscreen();
  }
});
$('#stage-fullscreen').addEventListener('click', () => void toggleStageFullscreen());
$('#refresh-live-view').addEventListener('click', reconnectLiveView);
document.addEventListener('fullscreenchange', updateFullscreenControls);
document.addEventListener('webkitfullscreenchange', updateFullscreenControls);
document.addEventListener('visibilitychange', () => void syncWakeLock());
window.addEventListener('resize', () => void syncWakeLock());

liveBrowser.addEventListener('load', () => {
  if (liveBrowser.src && liveBrowser.src !== 'about:blank') setStageLoading(false);
});
sessionReplay.addEventListener('loadeddata', () => setStageLoading(false));
sessionReplay.addEventListener('error', () => setStageLoading(false));

const workspaceResizer = $('#workspace-resizer');
workspaceResizer.addEventListener('pointerdown', (event) => {
  if (window.innerWidth < 768) return;
  workspaceResizer.classList.add('dragging');
  workspaceResizer.setPointerCapture(event.pointerId);
});
workspaceResizer.addEventListener('pointermove', (event) => {
  if (!workspaceResizer.hasPointerCapture(event.pointerId)) return;
  const bounds = $('#workspace').getBoundingClientRect();
  setBrowserShare(((event.clientX - bounds.left) / bounds.width) * 100);
});
workspaceResizer.addEventListener('pointerup', (event) => {
  workspaceResizer.classList.remove('dragging');
  if (workspaceResizer.hasPointerCapture(event.pointerId)) workspaceResizer.releasePointerCapture(event.pointerId);
});
workspaceResizer.addEventListener('pointercancel', (event) => {
  workspaceResizer.classList.remove('dragging');
  if (workspaceResizer.hasPointerCapture(event.pointerId)) workspaceResizer.releasePointerCapture(event.pointerId);
});
workspaceResizer.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  setBrowserShare(state.browserShare + (event.key === 'ArrowRight' ? 3 : -3));
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
  resizeComposer();
  setBrowserShare(state.browserShare);
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
