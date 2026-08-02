import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  classifyIntent,
  createApp,
  isAgentConversation,
  recoverableLiveViewUrl,
  shouldClarifyBeforeAction,
  toolInventoryDecision,
} from '../server.mjs';

test('classifies read-only Facebook requests without confirmation', () => {
  assert.deepEqual(classifyIntent('Find recent posts asking for Chinese lessons'), {
    kind: 'read',
    needsConfirmation: false,
    summary: 'This request only reads or navigates Facebook.',
  });
  assert.equal(classifyIntent('Tell me what is visible. Do not click or change anything.').needsConfirmation, false);
  assert.equal(classifyIntent('Resume las notificaciones sin enviar mensajes.').needsConfirmation, false);
});

test('requires confirmation for visible Facebook writes in English and Spanish', () => {
  assert.equal(classifyIntent('Comment on these three posts').needsConfirmation, true);
  assert.equal(classifyIntent('Publicar esto en cuatro grupos').needsConfirmation, true);
  assert.equal(classifyIntent('Send her a message').needsConfirmation, true);
});

test('conversational messages return an agent reply without creating a browser task', async () => {
  const calls = [];
  const server = createApp({
    agentResponder: async (message, history) => {
      calls.push({ message, history });
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
  assert.deepEqual(calls, [{ message: 'hello', history: [] }]);
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

test('a missing write detail remains conversational and never starts a browser action', async () => {
  const decision = {
    mode: 'action',
    reply: "Tell me what you'd like to share and I can publish it.",
    actionPrompt: 'Create a Facebook story containing the text or media the user provides.',
  };
  assert.equal(shouldClarifyBeforeAction(decision), true);
  const server = createApp({ agentResponder: async () => decision });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-key': process.env.APP_ACCESS_KEY || '' },
    body: JSON.stringify({ message: 'publish a story', history: [] }),
  });
  const payload = await response.json();
  assert.equal(payload.mode, 'chat');
  assert.equal(payload.actionPrompt, '');
  assert.match(payload.reply, /tell me what/i);
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
  assert.equal(inventory.browserSession, 'persistent');
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
  assert.equal(classifyIntent(payload.actionPrompt).needsConfirmation, true);
  await new Promise((resolve) => server.close(resolve));
});

test('only restores the matching Anchor live-view session URL', () => {
  const sessionId = 'f92c54ff-f51c-4962-ba2b-55c58f4fb328';
  assert.equal(recoverableLiveViewUrl(`https://live.anchorbrowser.io/?sessionId=${sessionId}`, sessionId), true);
  assert.equal(recoverableLiveViewUrl('https://example.com/?sessionId=' + sessionId, sessionId), false);
  assert.equal(recoverableLiveViewUrl('https://live.anchorbrowser.io/?sessionId=another-session', sessionId), false);
});

test('client persists agent continuity and passes the current session back to actions', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /anchor-chat-history/);
  assert.match(source, /anchor-active-workflow/);
  assert.match(source, /anchor-action-queue/);
  assert.match(source, /anchor-pending-prompt/);
  assert.match(source, /anchor-mobile-view/);
  assert.match(source, /anchor-browser-collapsed/);
  assert.match(source, /anchor-chat-draft/);
  assert.match(source, /session: state\.session/);
  assert.match(source, /resumeWorkflow/);
  assert.match(source, /restorePendingConfirmation/);
});

test('mobile UI exposes chat, live browser, full-screen input, and slash commands', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /data-mobile-view="browser"/);
  assert.match(html, /id="open-live"/);
  assert.match(html, /data-command="\/browser"/);
  assert.match(css, /body\[data-mobile-view="browser"\] \.chat-card/);
});

test('health exposes deployment identity without secrets', async () => {
  const server = createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.service, 'anchor-browser-from-anywhere');
  assert.equal(payload.version, '1.3.0');
  assert.equal('cookies' in payload, false);
  await new Promise((resolve) => server.close(resolve));
});
