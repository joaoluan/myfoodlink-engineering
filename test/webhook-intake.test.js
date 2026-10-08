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

test('falha interna responde 503 sem confirmar uma mensagem nao gravada', async () => {
  const errors = [];
  const { intake } = buildIntake({
    logger: { error: (...args) => errors.push(args.join(' ')) },
    recordIncoming: async () => { throw new Error('banco indisponivel'); }
  });
  const response = createResponse();

  const result = await intake({ body: { message: { messageId: 'wamid-2', text: 'Oi' } } }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(result.reason, 'internal_error');
  assert.match(errors[0], /banco indisponivel/);
  assert.doesNotMatch(errors[0], /Oi/, 'o log nao carrega o conteudo da mensagem');
});

test('falha de gravacao libera o ID para reenvio quando o banco recupera', async () => {
  let available = false;
  let attempts = 0;
  const saved = new Set();
  const { intake } = buildIntake({
    recordIncoming: async message => {
      attempts++;
      if (!available) throw new Error('banco indisponivel');
      saved.add(message.messageId);
    }
  });
  const request = { body: { message: { messageId: 'retry-after-failure', text: 'Oi' } } };
  const failedResponse = createResponse();
  assert.equal((await intake(request, failedResponse)).reason, 'internal_error');
  assert.equal(failedResponse.statusCode, 503);
  available = true;
  assert.equal((await intake(request, createResponse())).done, false);
  assert.equal((await intake(request, createResponse())).reason, 'duplicate');
  assert.equal(attempts, 2);
  assert.deepEqual([...saved], ['retry-after-failure']);
});

test('entregas simultaneas aguardam a gravacao sem confirmar sucesso antes dela', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let started;
  const entered = new Promise(resolve => { started = resolve; });
  let writes = 0;
  const { intake } = buildIntake({
    recordIncoming: async () => { writes++; started(); await blocked; }
  });
  const request = { body: { message: { messageId: 'concurrent-delivery', text: 'Oi' } } };
  const firstResponse = createResponse();
  const secondResponse = createResponse();
  const first = intake(request, firstResponse);
  await entered;
  const second = intake(request, secondResponse);
  assert.equal(secondResponse.headersSent, false);
  assert.equal(writes, 1);
  release();
  assert.equal((await first).done, false);
  assert.equal((await second).reason, 'duplicate');
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(writes, 1);
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

test('janela de deduplicacao expira e libera o mesmo ID', async () => {
  let clock = 0;
  const dedup = createDedupCache({ windowMs: 1000, now: () => clock });

  assert.equal((await dedup.runOnce('a', () => {})).duplicate, false);
  assert.equal((await dedup.runOnce('a', () => {})).duplicate, true);
  clock = 1500;
  assert.equal((await dedup.runOnce('a', () => {})).duplicate, false);
});

test('cache de deduplicacao respeita o limite de memoria', async () => {
  const dedup = createDedupCache({ maxEntries: 3 });
  for (const id of ['a', 'b', 'c', 'd']) await dedup.runOnce(id, () => {});

  assert.equal(dedup.size(), 3);
  assert.equal((await dedup.runOnce('a', () => {})).duplicate, false, 'o mais antigo saiu primeiro');
});

test('falha simultanea devolve 503 para ambas as entregas e permite tentar novamente', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let started;
  const entered = new Promise(resolve => { started = resolve; });
  let failing = true;
  let attempts = 0;
  const dedup = createDedupCache();
  const { intake } = buildIntake({
    dedup,
    recordIncoming: async () => {
      attempts++;
      started();
      await blocked;
      if (failing) throw new Error('banco indisponivel');
    }
  });
  const request = { body: { message: { messageId: 'concurrent-failure', text: 'Oi' } } };
  const responses = [createResponse(), createResponse()];
  const first = intake(request, responses[0]);
  await entered;
  const second = intake(request, responses[1]);
  release();
  const results = await Promise.all([first, second]);
  assert.deepEqual(results.map(r => r.reason), ['internal_error', 'internal_error']);
  assert.deepEqual(responses.map(r => r.statusCode), [503, 503]);
  assert.equal(attempts, 1);
  assert.equal(dedup.size(), 0);
  assert.equal(dedup.pendingSize(), 0);
  failing = false;
  assert.equal((await intake(request, createResponse())).done, false);
  assert.equal(attempts, 2);
});

test('falha no opt-out pode ser repetida com persistencia idempotente', async () => {
  let failing = true;
  const saved = new Set();
  const optOuts = new Set();
  const { intake } = buildIntake({
    recordIncoming: async message => { saved.add(message.messageId); },
    classifyOptOut: async () => ({ optOut: true, reason: 'explicit' }),
    onOptOut: async message => {
      if (failing) throw new Error('falha temporaria no descadastro');
      optOuts.add(message.messageId);
    }
  });
  const request = { body: { message: { messageId: 'retry-opt-out', text: 'sair' } } };
  const response = createResponse();
  assert.equal((await intake(request, response)).reason, 'internal_error');
  assert.equal(response.statusCode, 503);
  failing = false;
  assert.equal((await intake(request, createResponse())).reason, 'opt_out');
  assert.equal((await intake(request, createResponse())).reason, 'duplicate');
  assert.equal(saved.size, 1);
  assert.deepEqual([...optOuts], ['retry-opt-out']);
});

test('admissao exige um adaptador de persistencia explicito', () => {
  assert.throws(() => createWebhookIntake({ dedup: createDedupCache() }), /recordIncoming obrigatorio/);
});

test('capacidade nao expulsa uma admissao em andamento para aceitar outra', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const dedup = createDedupCache({ maxEntries: 1 });
  const first = dedup.runOnce('pending', () => blocked);
  await assert.rejects(dedup.runOnce('other', () => {}), /limite de admissoes/);
  assert.equal(dedup.pendingSize(), 1);
  release();
  await first;
  assert.equal(dedup.pendingSize(), 0);
});
