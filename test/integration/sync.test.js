'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { openStore, confirmSale, ingest } = require('../../src/sync/store');
const { createSyncWorker } = require('../../src/sync/worker');

const sale = (overrides = {}) => ({ tenantId: 'demo-a', eventId: 'event-1',
  saleId: 'sale-1', type: 'sale.confirmed.v1', paidCents: 2590, ...overrides });

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'mfl-sync-'));
  const localPath = join(dir, 'local.sqlite');
  let local = openStore(localPath);
  const cloud = openStore(join(dir, 'cloud.sqlite'));
  t.after(() => { local.close(); cloud.close(); rmSync(dir, { recursive: true }); });
  return { get local() { return local; }, cloud,
    restart() { local.close(); local = openStore(localPath); } };
}
const count = (db, table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test('venda e outbox sobrevivem ao fechamento e reabertura do banco', t => {
  const f = fixture(t);
  confirmSale(f.local, sale());
  f.restart();
  assert.equal(count(f.local, 'sales'), 1);
  assert.equal(count(f.local, 'outbox'), 1);
});

test('falha na outbox desfaz também a venda na mesma transação', t => {
  const f = fixture(t);
  confirmSale(f.local, sale());
  assert.throws(() => confirmSale(f.local, sale({ saleId: 'sale-2' })), /UNIQUE/);
  assert.equal(count(f.local, 'sales'), 1);
  assert.equal(count(f.local, 'outbox'), 1);
});

test('resposta perdida depois do commit remoto não duplica o efeito no retry', async t => {
  const f = fixture(t);
  confirmSale(f.local, sale());
  let clock = 0;
  let loseAck = true;
  const worker = createSyncWorker({ db: f.local, tenantId: 'demo-a', now: () => clock,
    random: () => 0, send: async event => {
      const result = ingest(f.cloud, 'demo-a', event);
      if (loseAck) throw new Error('connection_reset_after_commit');
      return result;
    } });
  assert.deepEqual(await worker.flushOnce(), { selected: 1, acked: 0, pending: 1 });
  assert.equal(count(f.cloud, 'projected_sales'), 1);
  assert.equal((await worker.flushOnce()).selected, 0, 'respeita backoff');
  clock = 1000;
  loseAck = false;
  assert.equal((await worker.flushOnce()).acked, 1);
  assert.equal(count(f.cloud, 'projected_sales'), 1);
  assert.equal((await worker.flushOnce()).selected, 0);
});

test('loja offline mantém venda e evento pendente após reinício', async t => {
  const f = fixture(t);
  confirmSale(f.local, sale());
  const worker = createSyncWorker({ db: f.local, tenantId: 'demo-a',
    send: async () => { throw new Error('offline'); } });
  await worker.flushOnce();
  f.restart();
  assert.equal(count(f.local, 'sales'), 1);
  assert.equal(f.local.prepare('SELECT acked, attempts FROM outbox').get().acked, 0);
  assert.equal(f.local.prepare('SELECT attempts FROM outbox').get().attempts, 1);
});

test('tenant não pode enviar evento em nome de outro', t => {
  const f = fixture(t);
  assert.throws(() => ingest(f.cloud, 'demo-b', sale()), /tenant_mismatch/);
  assert.equal(count(f.cloud, 'inbox'), 0);
});

test('mesmo ID em tenants distintos não conflita; payload alterado no mesmo tenant é recusado', t => {
  const f = fixture(t);
  ingest(f.cloud, 'demo-a', sale());
  ingest(f.cloud, 'demo-b', sale({ tenantId: 'demo-b' }));
  assert.throws(() => ingest(f.cloud, 'demo-a', sale({ paidCents: 999 })), /event_conflict/);
  assert.equal(count(f.cloud, 'projected_sales'), 2);
});

test('falha ao projetar desfaz inbox e permite nova tentativa', t => {
  const f = fixture(t);
  f.cloud.exec(`CREATE TRIGGER fail_projection BEFORE INSERT ON projected_sales
    BEGIN SELECT RAISE(ABORT, 'projection_failed'); END`);
  assert.throws(() => ingest(f.cloud, 'demo-a', sale()), /projection_failed/);
  assert.equal(count(f.cloud, 'inbox'), 0);
  f.cloud.exec('DROP TRIGGER fail_projection');
  assert.equal(ingest(f.cloud, 'demo-a', sale()).duplicate, false);
});

test('ACK de outro evento não confirma a outbox', async t => {
  const f = fixture(t);
  confirmSale(f.local, sale());
  const worker = createSyncWorker({ db: f.local, tenantId: 'demo-a',
    send: async () => ({ accepted: ['unrelated-event'] }) });
  assert.equal((await worker.flushOnce()).acked, 0);
  assert.equal(f.local.prepare('SELECT acked FROM outbox').get().acked, 0);
});

test('flushes simultâneos no mesmo worker compartilham o envio', async t => {
  const f = fixture(t);
  confirmSale(f.local, sale());
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let sends = 0;
  const worker = createSyncWorker({ db: f.local, tenantId: 'demo-a', send: async event => {
    sends++;
    await gate;
    return ingest(f.cloud, 'demo-a', event);
  } });
  const first = worker.flushOnce();
  const second = worker.flushOnce();
  assert.equal(first, second);
  release();
  await Promise.all([first, second]);
  assert.equal(sends, 1);
});

test('dinheiro fracionário, inseguro e evento desconhecido são rejeitados antes da gravação', t => {
  const f = fixture(t);
  for (const paidCents of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => confirmSale(f.local, sale({ paidCents })), /invalid_paidCents/);
  }
  assert.throws(() => confirmSale(f.local, sale({ type: 'unknown' })), /unsupported_event/);
  assert.equal(count(f.local, 'sales'), 0);
});
