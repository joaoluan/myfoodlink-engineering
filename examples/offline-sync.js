'use strict';

const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const { openStore, confirmSale, ingest } = require('../src/sync/store');
const { createSyncWorker } = require('../src/sync/worker');

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'mfl-demo-'));
  const local = openStore(join(dir, 'store.sqlite'));
  const cloud = openStore(join(dir, 'cloud.sqlite'));
  try {
    let clock = 0;
    let connected = false;
    let loseAck = true;
    const worker = createSyncWorker({ db: local, tenantId: 'demo-a',
      now: () => clock, random: () => 0,
      send: async event => {
        if (!connected) throw new Error('offline');
        const ack = ingest(cloud, 'demo-a', event);
        if (loseAck) throw new Error('response_lost');
        return ack;
      } });
    const rows = [];
    const snapshot = step => rows.push({ step,
      localSales: local.prepare('SELECT COUNT(*) AS n FROM sales').get().n,
      pendingEvents: local.prepare('SELECT COUNT(*) AS n FROM outbox WHERE acked = 0').get().n,
      cloudSales: cloud.prepare('SELECT COUNT(*) AS n FROM projected_sales').get().n });
    confirmSale(local, { tenantId: 'demo-a', saleId: 'sale-1', eventId: 'event-1',
      type: 'sale.confirmed.v1', paidCents: 2590 });
    await worker.flushOnce();
    snapshot('1. Venda confirmada sem internet');
    connected = true;
    clock = 1000;
    await worker.flushOnce();
    snapshot('2. Nuvem gravou, mas a resposta se perdeu');
    loseAck = false;
    clock = 10000;
    await worker.flushOnce();
    snapshot('3. Reenvio confirmado sem duplicar venda');
    assert.equal(rows[2].cloudSales, 1);
    assert.equal(rows[2].pendingEvents, 0);
    console.table(rows);
    console.log('Verificado: 1 venda local, 1 projeção remota, nenhum evento pendente.');
  } finally {
    local.close();
    cloud.close();
    rmSync(dir, { recursive: true });
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
