import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendMessageRequest, SendTimeoutError } from './sendMessage.js';

test('send confirmation and uncertain outcomes', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ idMessage: 'sent-1' }) });
  assert.equal((await sendMessageRequest('https://example.test', {}, 100)).idMessage, 'sent-1');
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  await assert.rejects(sendMessageRequest('https://example.test', {}, 100), /500/);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  await assert.rejects(sendMessageRequest('https://example.test', {}, 100), /ID сообщения/);
  let signal;
  globalThis.fetch = async (_, options) => { signal = options.signal; return new Promise(() => {}); };
  await assert.rejects(sendMessageRequest('https://example.test', {}, 10), SendTimeoutError);
  assert.equal(signal.aborted, true);
  globalThis.fetch = async () => ({ ok: true, json: () => new Promise(() => {}) });
  await assert.rejects(sendMessageRequest('https://example.test', {}, 10), SendTimeoutError);
});
