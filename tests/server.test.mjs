import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  classifyIntent,
  createApp,
  facebookContextForRequest,
  isAgentConversation,
  providerLiveViewUrl,
  recoverableLiveViewUrl,
  SESSION_USER,
  sessionBelongsToUser,
  sessionHistoryItem,
  shouldClarifyBeforeAction,
  toolInventoryDecision,
} from '../server.mjs';

const TEST_CONTEXT = {
  version: 'test-runtime-config',
  instructions: ['Use configured context and inspect the current Facebook account before acting.'],
  priorities: ['Handle recent and relevant activity first.'],
};

test('classifies read-only Facebook requests', () => {
  assert.deepEqual(classifyIntent('Find recent posts that need attention'), {
    kind: 'read',
    isWrite: false,
    summary: 'This request only reads or navigates Facebook.',
  });
  assert.equal(classifyIntent('Tell me what is visible. Do not click or change anything.').isWrite, false);
  assert.equal(classifyIntent('Resume las notificaciones sin enviar mensajes.').isWrite, false);
  assert.equal(classifyIntent('Revisa publicaciones, comentarios y mensajes recientes.').isWrite, false);
});

test('classifies visible Facebook writes in English and Spanish', () => {
  assert.equal(classifyIntent('Comment on these three posts').isWrite, true);
  assert.equal(classifyIntent('Publicar esto en cuatro grupos').isWrite, true);
  assert.equal(classifyIntent('Send her a message').isWrite, true);
  assert.equal(classifyIntent('Revisa la cuenta y publícala.').isWrite, true);
  assert.equal(classifyIntent('Coméntalo y envíale una respuesta.').isWrite, true);
  assert.equal(classifyIntent('Súbela y luego elimínala.').isWrite, true);
  assert.equal(classifyIntent('Do not publish or change anything.').isWrite, false);
});

test('the run endpoint starts a requested write directly', async () => {
  const calls = [];
  const server = createApp({
    anchorRequest: async (path, options = {}) => {
      calls.push({ path, options });
      if (path === '/sessions/live-session') {
        return { session_id: 'live-session', status: 'running', tags: ['anchorbrowser-from-anywhere', 'facebook', SESSION_USER] };
      }
      if (path === '/tools/perform-web-task?sessionId=live-session' && options.method === 'POST') {
        return { workflow_id: 'direct-write', status: 'running' };
      }
      throw new Error(`Unexpected Anchor request: ${path}`);
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-key': process.env.APP_ACCESS_KEY || '' },
    body: JSON.stringify({
      clientId: 'proof',
      prompt: 'Revisa la cuenta y publícala.',
      session: { sessionId: 'live-session', liveViewUrl: providerLiveViewUrl('live-session') },
    }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.task.workflowId, 'direct-write');
  const task = JSON.parse(calls.find((call) => call.path.startsWith('/tools/perform-web-task')).options.body);
  assert.match(task.prompt, /explicitly requested this external action/i);
  assert.match(task.prompt, /operating agent, not a fixed macro/i);
  assert.match(task.prompt, /revise your plan when evidence changes/i);
  assert.match(task.prompt, /suggested copy and historical context as provisional/i);
  assert.match(task.prompt, /omit anything unsupported/i);
  assert.match(task.prompt, /inspect the final Facebook preview/i);
  await new Promise((resolve) => server.close(resolve));
});

test('conversational messages return an agent reply without creating a browser task', async () => {
  const calls = [];
  const server = createApp({
    agentContext: TEST_CONTEXT,
    agentResponder: async (message, history, context) => {
      calls.push({ message, history, context });
      return { mode: 'chat', reply: 'Hello! How can I help?', actionPrompt: '' };
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-key': process.env.APP_ACCESS_KEY || '' },
    body: JSON.stringify({ message: 'hello', history: [] }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true, mode: 'chat', reply: 'Hello! How can I help?', actionPrompt: '' });
  assert.equal(calls[0].message, 'hello');
  assert.deepEqual(calls[0].history, []);
  assert.match(calls[0].context, /test-runtime-config/);
  await new Promise((resolve) => server.close(resolve));
});

test('agent-status questions remain conversational even if the model misroutes them', async () => {
  assert.equal(isAgentConversation('What are you doing right now?'), true);
  const server = createApp({
    agentResponder: async () => ({
      mode: 'action',
      reply: 'I am checking the current Facebook page.',
      actionPrompt: 'Inspect Facebook again.',
    }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-key': process.env.APP_ACCESS_KEY || '' },
    body: JSON.stringify({
      message: 'What are you doing right now?',
      history: [],
      activeWorkflow: { prompt: 'Inspect the current Facebook page.' },
    }),
  });
  const payload = await response.json();
  assert.equal(payload.mode, 'chat');
  assert.equal(payload.actionPrompt, '');
  assert.match(payload.reply, /currently working.*Inspect the current Facebook page/i);
  await new Promise((resolve) => server.close(resolve));
});

test('configured context reaches the agent without committed business rules', async () => {
  const context = facebookContextForRequest('perform the requested action', TEST_CONTEXT);
  assert.match(context, /test-runtime-config/);
  assert.match(context, /current Facebook account/);
  let receivedContext = '';
  const server = createApp({
    agentContext: TEST_CONTEXT,
    agentResponder: async (_message, _history, runtimeContext) => {
      receivedContext = runtimeContext;
      return {
        mode: 'action',
        reply: 'I can handle that using the configured context and current account activity.',
        actionPrompt: 'Inspect the current Facebook account and complete the requested action using suitable existing content.',
      };
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-key': process.env.APP_ACCESS_KEY || '' },
    body: JSON.stringify({ message: 'perform the requested action', history: [] }),
  });
  const payload = await response.json();
  assert.equal(payload.mode, 'action');
  assert.match(receivedContext, /test-runtime-config/);
  assert.match(payload.actionPrompt, /current Facebook account/i);
  await new Promise((resolve) => server.close(resolve));
});

test('an agent question remains conversational instead of starting a browser task', async () => {
  const decision = {
    mode: 'action',
    reply: 'Which item should I use?',
    actionPrompt: 'Act on the item once the user provides it.',
  };
  assert.equal(shouldClarifyBeforeAction(decision), true);
  const server = createApp({ agentContext: TEST_CONTEXT, agentResponder: async () => decision });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-key': process.env.APP_ACCESS_KEY || '' },
    body: JSON.stringify({ message: 'act on it', history: [] }),
  });
  const payload = await response.json();
  assert.equal(payload.mode, 'chat');
  assert.equal(payload.actionPrompt, '');
  await new Promise((resolve) => server.close(resolve));
});

test('tool inventory follows a JSON formatting request from conversation context', () => {
  const textDecision = toolInventoryDecision('lsit ur tools');
  assert.equal(textDecision.mode, 'chat');
  assert.match(textDecision.reply, /navigate:/i);
  const jsonDecision = toolInventoryDecision('in json', [
    { role: 'user', text: 'list ur tools' },
    { role: 'assistant', text: textDecision.reply },
  ]);
  const inventory = JSON.parse(jsonDecision.reply);
  assert.equal(inventory.agent, 'Anchor');
  assert.match(inventory.browserSession, /primary provider-backed session/i);
  assert.ok(inventory.tools.some((tool) => tool.name === 'human_handoff'));
});

test('agent can route an explicit Facebook request to the existing action pipeline', async () => {
  const server = createApp({
    agentResponder: async () => ({
      mode: 'action',
      reply: 'I’ll find one relevant post.',
      actionPrompt: 'Find one relevant Facebook post and comment on it.',
    }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-key': process.env.APP_ACCESS_KEY || '' },
    body: JSON.stringify({ message: 'Please comment on one relevant post.', history: [] }),
  });
  const payload = await response.json();
  assert.equal(payload.mode, 'action');
  assert.equal(classifyIntent(payload.actionPrompt).isWrite, true);
  await new Promise((resolve) => server.close(resolve));
});

test('only restores the matching Anchor live-view session URL', () => {
  const sessionId = 'f92c54ff-f51c-4962-ba2b-55c58f4fb328';
  assert.equal(recoverableLiveViewUrl(`https://live.anchorbrowser.io/?sessionId=${sessionId}`, sessionId), true);
  assert.equal(recoverableLiveViewUrl('https://example.com/?sessionId=' + sessionId, sessionId), false);
  assert.equal(recoverableLiveViewUrl('https://live.anchorbrowser.io/?sessionId=another-session', sessionId), false);
});

test('provider history is attributed to the configured user and reconstructs running live links', () => {
  const running = {
    id: '3b6caa44-f9d2-4690-b935-aa58db2101c2',
    status: 'running',
    tags: ['anchorbrowser-from-anywhere', 'facebook', SESSION_USER],
    recording: true,
    created_at: '2026-08-02T20:16:31.240Z',
  };
  assert.equal(sessionBelongsToUser(running), true);
  assert.equal(sessionBelongsToUser({ ...running, tags: ['other-app'] }), false);
  const item = sessionHistoryItem(running);
  assert.equal(item.user, SESSION_USER);
  assert.equal(item.liveViewUrl, providerLiveViewUrl(running.id));
  assert.equal(item.taggedUser, true);
});

test('session history endpoint chooses the newest running app session without a database', async () => {
  const sessions = [
    { id: 'new-live', status: 'running', tags: ['anchorbrowser-from-anywhere', 'facebook', SESSION_USER], recording: true, created_at: '2026-08-02T20:20:00Z' },
    { id: 'older-recording', status: 'completed', tags: ['anchorbrowser-from-anywhere', 'facebook', SESSION_USER], recording: true, duration: 90, created_at: '2026-08-02T19:20:00Z' },
    { id: 'other-user', status: 'running', tags: ['another-app'], recording: true, created_at: '2026-08-02T21:20:00Z' },
  ];
  const server = createApp({ anchorRequest: async (path) => {
    assert.match(path, /^\/sessions\?/);
    return { sessions };
  } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/sessions`, {
    headers: { 'x-access-key': process.env.APP_ACCESS_KEY || '' },
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.user, SESSION_USER);
  assert.equal(payload.idleMinutes, 15);
  assert.equal(payload.sessions.length, 2);
  assert.equal(payload.activeSession.sessionId, 'new-live');
  await new Promise((resolve) => server.close(resolve));
});

test('recording endpoint exposes only a provider recording belonging to this app user', async () => {
  const server = createApp({ anchorRequest: async (path) => {
    if (path === '/sessions/recorded-session') {
      return { session_id: 'recorded-session', status: 'completed', tags: ['anchorbrowser-from-anywhere', 'facebook', SESSION_USER] };
    }
    if (path === '/sessions/recorded-session/recordings') {
      return { items: [{ id: 'primary', is_primary: true, file_link: 'https://recordings.example/session.mp4', duration: '00:01:30' }] };
    }
    throw new Error(`Unexpected Anchor request: ${path}`);
  } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/sessions/recorded-session/recording`, {
    headers: { 'x-access-key': process.env.APP_ACCESS_KEY || '' },
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.recording.sessionId, 'recorded-session');
  assert.equal(payload.recording.url, 'https://recordings.example/session.mp4');
  await new Promise((resolve) => server.close(resolve));
});

test('new sessions are parallel, tagged to the configured user, recorded, and expire after inactivity', async () => {
  const calls = [];
  const server = createApp({
    profileName: 'test-profile',
    anchorRequest: async (path, options = {}) => {
      calls.push({ path, options });
      if (path === '/sessions' && options.method === 'POST') {
        return { id: 'parallel-session', cdp_url: 'wss://example.invalid', live_view_url: providerLiveViewUrl('parallel-session') };
      }
      throw new Error(`Unexpected Anchor request: ${path}`);
    },
    prepareFacebookSession: async () => ({ authenticated: true, url: 'https://www.facebook.com/', cookiesApplied: 4 }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-key': process.env.APP_ACCESS_KEY || '' },
    body: JSON.stringify({
      clientId: 'device',
      forceNew: true,
      cookies: ['c_user', 'xs', 'datr', 'sb'].map((name) => ({ name, value: 'value' })),
      session: { sessionId: 'existing-session', liveViewUrl: providerLiveViewUrl('existing-session') },
    }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.session.sessionId, 'parallel-session');
  assert.equal(calls.some((call) => call.options.method === 'DELETE'), false);
  const config = JSON.parse(calls[0].options.body);
  assert.deepEqual(config.session.tags, ['anchorbrowser-from-anywhere', 'facebook', SESSION_USER]);
  assert.deepEqual(config.session.timeout, { idle_timeout: 15, max_duration: 1440 });
  assert.deepEqual(config.session.recording, { active: true });
  assert.deepEqual(config.browser.profile, { name: 'test-profile', persist: true });
  await new Promise((resolve) => server.close(resolve));
});

test('active browser agent can be paused and resumed without ending its session', async () => {
  const calls = [];
  const server = createApp({ anchorRequest: async (path, options = {}) => {
    calls.push({ path, options });
    if (path === '/sessions/live-session') {
      return { session_id: 'live-session', status: 'running', tags: ['anchorbrowser-from-anywhere', 'facebook', SESSION_USER] };
    }
    if (path === '/sessions/live-session/agent/pause' && options.method === 'POST') return { status: 'paused' };
    if (path === '/sessions/live-session/agent/resume' && options.method === 'POST') return { status: 'running' };
    throw new Error(`Unexpected Anchor request: ${path}`);
  } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/session/agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-key': process.env.APP_ACCESS_KEY || '' },
    body: JSON.stringify({ clientId: 'device', action: 'pause', session: { sessionId: 'live-session' } }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.action, 'pause');
  assert.equal(payload.status, 'paused');
  const resumeResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/session/agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-key': process.env.APP_ACCESS_KEY || '' },
    body: JSON.stringify({ clientId: 'device', action: 'resume', session: { sessionId: 'live-session' } }),
  });
  const resumePayload = await resumeResponse.json();
  assert.equal(resumeResponse.status, 200);
  assert.equal(resumePayload.action, 'resume');
  assert.equal(resumePayload.status, 'running');
  assert.equal(calls.some((call) => call.options.method === 'DELETE'), false);
  await new Promise((resolve) => server.close(resolve));
});

test('media attachments are uploaded into the selected Anchor session for agent use', async () => {
  const calls = [];
  const server = createApp({ anchorRequest: async (path, options = {}) => {
    calls.push({ path, options });
    if (path === '/sessions/live-session') {
      return { session_id: 'live-session', status: 'running', tags: ['anchorbrowser-from-anywhere', 'facebook', SESSION_USER] };
    }
    if (path === '/sessions/live-session/agent/files' && options.method === 'POST') {
      assert.equal(options.body instanceof FormData, true);
      const uploaded = options.body.get('file');
      assert.equal(uploaded.type, 'image/png');
      assert.match(uploaded.name, /^room-[a-f0-9]{8}\.png$/);
      return { status: 'success', message: `File saved at /uploads/${uploaded.name}` };
    }
    throw new Error(`Unexpected Anchor request: ${path}`);
  } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const form = new FormData();
  form.append('clientId', 'device');
  form.append('sessionId', 'live-session');
  form.append('liveViewUrl', providerLiveViewUrl('live-session'));
  form.append('files', new Blob(['image-bytes'], { type: 'image/png' }), 'room.png');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/session/files`, {
    method: 'POST',
    headers: { 'x-access-key': process.env.APP_ACCESS_KEY || '' },
    body: form,
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.resources.length, 1);
  assert.match(payload.resources[0].path, /^\/uploads\/room-[a-f0-9]{8}\.png$/);
  assert.equal(payload.resources[0].type, 'image/png');
  assert.equal(calls.filter((call) => call.path.endsWith('/agent/files')).length, 1);
  await new Promise((resolve) => server.close(resolve));
});

test('client persists agent continuity and passes the current session back to actions', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /anchor-chat-history/);
  assert.match(source, /anchor-active-workflow/);
  assert.match(source, /anchor-action-queue/);
  assert.doesNotMatch(source, /anchor-pending-prompt/);
  assert.match(source, /anchor-mobile-view/);
  assert.match(source, /anchor-browser-collapsed/);
  assert.match(source, /anchor-chat-draft/);
  assert.match(source, /session: state\.session/);
  assert.match(source, /resumeWorkflow/);
  assert.doesNotMatch(source, /restorePendingConfirmation/);
  assert.match(source, /loadSessionHistory\(true\)/);
  assert.match(source, /CLIENT_IDLE_CLOSE_MS = 30 \* 60 \* 1000/);
  assert.match(source, /anchor-browser-share/);
  assert.match(source, /toggleTaskPause/);
});

test('mobile UI exposes chat, live browser, native full screen, reconnect, wake lock, and slash commands', async () => {
  const [html, css, client] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /data-mobile-view="browser"/);
  assert.match(html, /id="open-live"/);
  assert.match(html, /id="session-history"/);
  assert.match(html, /id="session-replay"/);
  assert.match(html, /New parallel session/);
  assert.match(html, /id="workspace-resizer"/);
  assert.match(html, /id="stop-task"/);
  assert.match(html, /id="attach-media"/);
  assert.match(html, /id="media-input" type="file" accept="image\/\*,video\/\*" multiple/);
  assert.match(html, /id="attachment-list"/);
  assert.match(html, /id="stage-loading"/);
  assert.match(html, /id="stage-controls"/);
  assert.match(html, /id="refresh-live-view"/);
  assert.match(html, /id="stage-fullscreen"/);
  assert.doesNotMatch(html, /id="confirm-dialog"/);
  assert.match(html, /allowfullscreen loading="eager"/);
  assert.match(html, /View all sessions/);
  assert.match(html, /data-command="\/browser"/);
  assert.match(css, /body\[data-mobile-view="browser"\] \.chat-card/);
  assert.match(css, /\.history-menu/);
  assert.match(css, /\.workspace-resizer/);
  assert.match(css, /\.stage-loading/);
  assert.match(css, /\.browser-stage:fullscreen/);
  assert.match(css, /\.stage-controls/);
  assert.match(css, /\.command-hint button \{ min-width: 2\.75rem; min-height: 2\.75rem;/);
  assert.match(css, /\.attach-media \{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/s);
  assert.match(client, /requestFullscreen/);
  assert.match(client, /navigator\.wakeLock/);
  assert.match(client, /Reconnecting the live view/);
  assert.match(client, /uploadAttachments/);
  assert.match(client, /new FormData\(\)/);
  assert.match(client, /\/api\/session\/files/);
  assert.match(client, /Use the user-attached Anchor resources/);
});

test('health exposes deployment identity without secrets', async () => {
  const server = createApp({ agentContext: TEST_CONTEXT, profileName: 'test-profile' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.service, 'anchor-browser-from-anywhere');
  assert.equal(payload.profileConfigured, true);
  assert.equal(payload.version, '1.10.0');
  assert.equal(payload.agentContextVersion, 'test-runtime-config');
  assert.equal(payload.sessionUser, SESSION_USER);
  assert.equal('cookies' in payload, false);
  await new Promise((resolve) => server.close(resolve));
});

test('committed product sources contain no account, campaign, or contact defaults', async () => {
  const source = await Promise.all([
    readFile(new URL('../server.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
  ]).then((parts) => parts.join('\n'));
  const forbiddenValues = [
    ['Zimo', ' Qiu'],
    ['Use', 'ra'],
    ['642', '609', '188'],
    ['Chinese', ' lessons'],
    ['kitty', 'fb'],
  ].map((parts) => parts.join(''));
  for (const forbidden of forbiddenValues) {
    assert.doesNotMatch(source, new RegExp(forbidden, 'i'));
  }
});
