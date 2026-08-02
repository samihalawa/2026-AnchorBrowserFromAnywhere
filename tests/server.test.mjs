import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIntent, createApp } from '../server.mjs';

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
