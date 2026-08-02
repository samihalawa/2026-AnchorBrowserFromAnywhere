import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIntent, createApp, recoverableLiveViewUrl } from '../server.mjs';

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

test('only restores the matching Anchor live-view session URL', () => {
  const sessionId = 'f92c54ff-f51c-4962-ba2b-55c58f4fb328';
  assert.equal(recoverableLiveViewUrl(`https://live.anchorbrowser.io/?sessionId=${sessionId}`, sessionId), true);
  assert.equal(recoverableLiveViewUrl('https://example.com/?sessionId=' + sessionId, sessionId), false);
  assert.equal(recoverableLiveViewUrl('https://live.anchorbrowser.io/?sessionId=another-session', sessionId), false);
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
  assert.equal('cookies' in payload, false);
  await new Promise((resolve) => server.close(resolve));
});
