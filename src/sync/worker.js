'use strict';

// Um worker por conexão local. Coordenação entre processos requer lease/claim persistente.
function createSyncWorker({ db, tenantId, send, now = Date.now, random = Math.random }) {
  let inFlight;

  async function flush() {
    const rows = db.prepare(`SELECT event_id, payload, attempts FROM outbox
      WHERE tenant_id = ? AND acked = 0 AND next_attempt_ms <= ?
      ORDER BY rowid LIMIT 50`).all(tenantId, now());
    let acked = 0;
    for (const row of rows) {
      try {
        const result = await send(JSON.parse(row.payload));
        if (!Array.isArray(result?.accepted) || !result.accepted.includes(row.event_id)) {
          throw new Error('missing_ack');
        }
        db.prepare('UPDATE outbox SET acked = 1 WHERE tenant_id = ? AND event_id = ?')
          .run(tenantId, row.event_id);
        acked++;
      } catch {
        // Timeout e ACK perdido são ambíguos: preserva o evento, reenvia com o mesmo ID.
        const cap = Math.min(60000, 1000 * 2 ** Math.min(row.attempts, 6));
        const delay = Math.round(cap * (0.5 + 0.5 * random()));
        db.prepare(`UPDATE outbox SET attempts = attempts + 1, next_attempt_ms = ?
          WHERE tenant_id = ? AND event_id = ? AND acked = 0`)
          .run(now() + delay, tenantId, row.event_id);
      }
    }
    return { selected: rows.length, acked, pending: rows.length - acked };
  }

  return {
    flushOnce() {
      if (!inFlight) inFlight = flush().finally(() => { inFlight = null; });
      return inFlight;
    }
  };
}

module.exports = { createSyncWorker };
