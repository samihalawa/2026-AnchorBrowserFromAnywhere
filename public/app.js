const $ = (selector) => document.querySelector(selector);
const state = {
  accessKey: sessionStorage.getItem('anchor-access-key') || '',
  clientId: localStorage.getItem('anchor-client-id') || crypto.randomUUID(),
  session: null,
  pendingPrompt: '',
  workflowId: null,
  history: [],
  cookies: localStorage.getItem('anchor-facebook-cookies') || '',
};
localStorage.setItem('anchor-client-id', state.clientId);

const unlockDialog = $('#unlock-dialog');
const confirmDialog = $('#confirm-dialog');
const connection = $('#connection');
const browserStage = $('#browser-stage');
const browserEmpty = $('#browser-empty');
const liveBrowser = $('#live-browser');
const messages = $('#messages');
const promptInput = $('#prompt');

function setStatus(label, mode = '') {
  connection.className = `connection ${mode}`.trim();
  connection.querySelector('b').textContent = label;
}

function addMessage(text, role = 'assistant', error = false) {
  const node = document.createElement('div');
  node.className = `message ${role}${error ? ' error' : ''}`;
  const avatar = document.createElement('span');
  avatar.textContent = role === 'user' ? 'YOU' : 'AB';
  const bubble = document.createElement('p');
  bubble.textContent = text;
  node.append(avatar, bubble);
  messages.append(node);
  messages.scrollTop = messages.scrollHeight;
  if (!error) {
    state.history.push({ role, text });
    state.history = state.history.slice(-12);
  }
  return bubble;
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

async function startSession() {
  if (!state.cookies) {
    $('#cookies-dialog').showModal();
    throw new Error('Paste your Facebook cookies before starting a session.');
  }
  setStatus('Starting…', 'busy');
  $('#start-session').disabled = true;
  try {
    const payload = await api('/api/session', {
      method: 'POST',
      body: JSON.stringify({ clientId: state.clientId, cookies: state.cookies }),
    });
    state.session = payload.session;
    liveBrowser.src = state.session.liveViewUrl;
    liveBrowser.hidden = false;
    browserEmpty.hidden = true;
    $('#close-session').hidden = false;
    $('#session-state').textContent = state.session.authenticated ? 'Facebook connected' : 'Login needed in live view';
    setStatus(state.session.authenticated ? 'Facebook live' : 'Login needed', state.session.authenticated ? 'live' : 'busy');
    addMessage(state.session.authenticated
      ? 'Your Facebook browser is live. Send me a request below.'
      : 'The browser is live, but Facebook needs login or two-factor verification. Complete it in the live view, then send your request.');
    return state.session;
  } catch (error) {
    setStatus('Could not start');
    addMessage(error.message, 'assistant', true);
    throw error;
  } finally {
    $('#start-session').disabled = false;
  }
}

async function closeSession() {
  await api('/api/session', { method: 'DELETE', body: JSON.stringify({ clientId: state.clientId }) }).catch(() => {});
  state.session = null;
  state.workflowId = null;
  liveBrowser.src = 'about:blank';
  liveBrowser.hidden = true;
  browserEmpty.hidden = false;
  $('#close-session').hidden = true;
  $('#session-state').textContent = 'Session off';
  setStatus('Ready');
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
      state.history.push({ role: 'assistant', text: bubble.textContent });
      state.history = state.history.slice(-12);
      setStatus('Facebook live', 'live');
      return;
    }
    if (['FAILED', 'ERROR', 'CANCELLED'].includes(task.status)) {
      bubble.textContent = task.error || task.result || 'The browser task failed.';
      bubble.parentElement.classList.add('error');
      setStatus('Task failed');
      return;
    }
    bubble.textContent = `Working in the live browser… ${task.status ? `(${task.status.toLowerCase()})` : ''}`;
  }
  bubble.textContent = 'The task is still running in the live browser.';
  setStatus('Still working', 'busy');
}

async function execute(prompt, confirmed = false) {
  if (!state.session) await startSession();
  setStatus('Working…', 'busy');
  const bubble = addMessage('Starting the browser task…');
  try {
    const payload = await api('/api/run', {
      method: 'POST',
      body: JSON.stringify({ clientId: state.clientId, prompt, confirmed, history: state.history.slice(-8), cookies: state.cookies }),
    });
    if (payload.session?.liveViewUrl && liveBrowser.src !== payload.session.liveViewUrl) liveBrowser.src = payload.session.liveViewUrl;
    if (payload.task.workflowId) {
      state.workflowId = payload.task.workflowId;
      await pollTask(payload.task.workflowId, bubble);
    } else {
      bubble.textContent = payload.task.result || 'The browser task completed.';
      state.history.push({ role: 'assistant', text: bubble.textContent });
      state.history = state.history.slice(-12);
      setStatus('Facebook live', 'live');
    }
  } catch (error) {
    bubble.textContent = error.message;
    bubble.parentElement.classList.add('error');
    setStatus('Task failed');
  }
}

async function submitPrompt(prompt) {
  addMessage(prompt, 'user');
  const preview = await api('/api/preview', { method: 'POST', body: JSON.stringify({ prompt }) });
  if (preview.needsConfirmation) {
    state.pendingPrompt = prompt;
    $('#confirm-prompt').textContent = prompt;
    confirmDialog.showModal();
    return;
  }
  await execute(prompt, false);
}

$('#composer').addEventListener('submit', async (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) return;
  promptInput.value = '';
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

document.querySelectorAll('[data-prompt]').forEach((button) => {
  button.addEventListener('click', () => {
    promptInput.value = button.dataset.prompt;
    promptInput.focus();
  });
});

$('#start-session').addEventListener('click', startSession);
$('#close-session').addEventListener('click', closeSession);
$('#open-cookies').addEventListener('click', () => {
  $('#cookies-json').value = state.cookies;
  $('#cookie-status').textContent = state.cookies ? 'Cookies saved on this device.' : 'Required: c_user, xs, datr and sb';
  $('#cookie-status').className = `cookie-status ${state.cookies ? 'good' : ''}`;
  $('#cookies-dialog').showModal();
});
$('#toggle-browser').addEventListener('click', (event) => {
  const collapsed = browserStage.classList.toggle('collapsed');
  event.currentTarget.textContent = collapsed ? 'Show view' : 'Hide view';
  event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
});

$('#confirm-run').addEventListener('click', () => {
  const prompt = state.pendingPrompt;
  state.pendingPrompt = '';
  if (prompt) execute(prompt, true);
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
    if (state.session) await closeSession();
    state.cookies = JSON.stringify(parsed);
    localStorage.setItem('anchor-facebook-cookies', state.cookies);
    status.textContent = `${parsed.length} cookies saved on this device.`;
    status.className = 'cookie-status good';
    setTimeout(() => $('#cookies-dialog').close(), 350);
  } catch (error) {
    status.textContent = error.message;
    status.className = 'cookie-status bad';
  }
});

if (!state.accessKey) unlockDialog.showModal();
else setStatus('Ready');
