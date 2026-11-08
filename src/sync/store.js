'use strict';

// Demonstrativo independente. SQLite também no destino para execução sem serviços.
const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');

function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function validate(event) {
  for (const key of ['tenantId', 'eventId', 'saleId']) {
    if (typeof event[key] !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(event[key])) {
      throw new Error(`invalid_${key}`);
    }
  }
  if (!Number.isSafeInteger(event.paidCents) || event.paidCents <= 0) {
    throw new Error('invalid_paidCents');
  }
  if (event.type !== 'sale.confirmed.v1') throw new Error('unsupported_event');
  // Ordem fixa e campos explícitos para comparar reenvios sem depender da ordem do JSON.
  return {
    tenantId: event.tenantId, eventId: event.eventId, saleId: event.saleId,
    type: event.type, paidCents: event.paidCents
  };
}

function openStore(filename) {
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS sales (
      tenant_id TEXT NOT NULL, sale_id TEXT NOT NULL,
      paid_cents INTEGER NOT NULL CHECK (paid_cents > 0),
      PRIMARY KEY (tenant_id, sale_id)
    );
    CREATE TABLE IF NOT EXISTS outbox (
      tenant_id TEXT NOT NULL, event_id TEXT NOT NULL, payload TEXT NOT NULL,
      acked INTEGER NOT NULL DEFAULT 0 CHECK (acked IN (0, 1)),
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt_ms INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (tenant_id, event_id)
    );
    CREATE TABLE IF NOT EXISTS inbox (
      tenant_id TEXT NOT NULL, event_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
      PRIMARY KEY (tenant_id, event_id)
    );
    CREATE TABLE IF NOT EXISTS projected_sales (
      tenant_id TEXT NOT NULL, sale_id TEXT NOT NULL, paid_cents INTEGER NOT NULL,
      PRIMARY KEY (tenant_id, sale_id)
    );
  `);
  return db;
}

function confirmSale(db, input) {
  const event = validate(input);
  transaction(db, () => {
    db.prepare('INSERT INTO sales VALUES (?, ?, ?)')
      .run(event.tenantId, event.saleId, event.paidCents);
    db.prepare('INSERT INTO outbox (tenant_id, event_id, payload) VALUES (?, ?, ?)')
      .run(event.tenantId, event.eventId, JSON.stringify(event));
  });
  return event;
}

// authenticatedTenant vem de uma identidade previamente verificada, nunca do payload.
// O adaptador de autenticação fica fora deste recorte público.
function ingest(db, authenticatedTenant, input) {
  const event = validate(input);
  if (event.tenantId !== authenticatedTenant) throw new Error('tenant_mismatch');
  const fingerprint = createHash('sha256').update(JSON.stringify(event)).digest('hex');
  return transaction(db, () => {
    const existing = db.prepare('SELECT fingerprint FROM inbox WHERE tenant_id = ? AND event_id = ?')
      .get(authenticatedTenant, event.eventId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error('event_conflict');
      return { accepted: [event.eventId], duplicate: true };
    }
    db.prepare('INSERT INTO inbox VALUES (?, ?, ?)')
      .run(authenticatedTenant, event.eventId, fingerprint);
    // Inbox e projeção confirmam juntas. Falha aqui libera o evento para retry.
    db.prepare('INSERT INTO projected_sales VALUES (?, ?, ?)')
      .run(authenticatedTenant, event.saleId, event.paidCents);
    return { accepted: [event.eventId], duplicate: false };
  });
}

module.exports = { openStore, confirmSale, ingest };
