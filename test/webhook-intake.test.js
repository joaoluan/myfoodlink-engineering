'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createWebhookIntake } = require('../src/webhook/intake');
const { createDedupCache } = require('../src/webhook/dedup-cache');
const { createResponse, silentLogger } = require('./helpers');

function buildIntake(overrides = {}) {
  const recorded = [];
  const intake = createWebhookIntake({
    logger: silentLogger,
    normalizeMessage: body => body.message || null,
    dedup: createDedupCache(),
    recordIncoming: async message => { recorded.push(message.messageId); },
    ...overrides
  });
  return { intake, recorded };
}

test('mensagem reenviada pelo provedor e processada uma unica vez', async () => {
  const { intake, recorded } = buildIntake();
  const body = { message: { messageId: 'wamid-1', phone: '5551999990000', text: 'Oi' } };

  const first = await intake({ body }, createResponse());
  const secondResponse = createResponse();
  const second = await intake({ body }, secondResponse);

  assert.equal(first.done, false);
  assert.deepEqual(second, { done: true, reason: 'duplicate' });
  assert.equal(secondResponse.statusCode, 200);
  assert.deepEqual(recorded, ['wamid-1']);
});

test('falha interna responde 200 para o provedor nao reenviar', async () => {
  const errors = [];
  const { intake } = buildIntake({
    logger: { error: (...args) => errors.push(args.join(' ')) },
    recordIncoming: async () => { throw new Error('banco indisponivel'); }
  });
  const response = createResponse();

  const result = await intake({ body: { message: { messageId: 'wamid-2', text: 'Oi' } } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(result.reason, 'internal_error');
  assert.match(errors[0], /banco indisponivel/);
  assert.doesNotMatch(errors[0], /Oi/, 'o log nao carrega o conteudo da mensagem');
});

test('evento sem mensagem (recibo, status) e ignorado com 200', async () => {
  const { intake } = buildIntake();
  const response = createResponse();

  const result = await intake({ body: {} }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(result.reason, 'ignored');
});

test('descadastro encerra o webhook e aciona o tratamento de opt-out', async () => {
  const optOuts = [];
  const { intake } = buildIntake({
    classifyOptOut: async message => ({ optOut: message.text === 'sair', reason: 'explicit' }),
    onOptOut: async message => { optOuts.push(message.messageId); }
  });

  const result = await intake({ body: { message: { messageId: 'wamid-3', text: 'sair' } } }, createResponse());

  assert.equal(result.reason, 'opt_out');
  assert.deepEqual(optOuts, ['wamid-3']);
});

test('janela de deduplicacao expira e libera o mesmo ID', () => {
  let clock = 0;
  const dedup = createDedupCache({ windowMs: 1000, now: () => clock });

  assert.equal(dedup.seenBefore('a'), false);
  assert.equal(dedup.seenBefore('a'), true);
  clock = 1500;
  assert.equal(dedup.seenBefore('a'), false);
});

test('cache de deduplicacao respeita o limite de memoria', () => {
  const dedup = createDedupCache({ maxEntries: 3 });
  ['a', 'b', 'c', 'd'].forEach(id => dedup.seenBefore(id));

  assert.equal(dedup.size(), 3);
  assert.equal(dedup.seenBefore('a'), false, 'o mais antigo saiu primeiro');
});
