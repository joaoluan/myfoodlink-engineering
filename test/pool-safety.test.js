'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createSettingsReader, poolSafetyConfig } = require('../src/db/pool-safety');

// Pool falso que imita o essencial do `pg.Pool`: no máximo `max` conexões e, se configurado,
// erro quando a espera por conexão passa de `connectionTimeoutMillis`.
function createFakePool({ max, connectionTimeoutMillis = 0 }) {
  let inUse = 0;
  const waiting = [];

  function release() {
    inUse -= 1;
    const next = waiting.shift();
    if (next) next();
  }

  function makeClient() {
    return {
      query: async () => {
        await new Promise(resolve => setImmediate(resolve));
        return { rows: [{ value: { timeZone: 'America/Sao_Paulo' } }] };
      },
      release
    };
  }

  function connect() {
    if (inUse < max) {
      inUse += 1;
      return Promise.resolve(makeClient());
    }
    return new Promise((resolve, reject) => {
      let timer = null;
      const grant = () => {
        if (timer) clearTimeout(timer);
        inUse += 1;
        resolve(makeClient());
      };
      waiting.push(grant);
      if (connectionTimeoutMillis) {
        timer = setTimeout(() => {
          waiting.splice(waiting.indexOf(grant), 1);
          reject(new Error('timeout exceeded when trying to connect'));
        }, connectionTimeoutMillis);
      }
    });
  }

  return {
    connect,
    async query(sql, params) {
      const client = await connect();
      try {
        return await client.query(sql, params);
      } finally {
        client.release();
      }
    }
  };
}

// Leitura do cardápio: abre transação e, dentro dela, precisa do fuso horário.
async function readMenu(pool, settings, { passTransactionClient }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const timeZone = passTransactionClient ? await settings.getTimeZone(client) : await settings.getTimeZone();
    await client.query('COMMIT');
    return timeZone;
  } finally {
    client.release();
  }
}

test('bug original: com o pool cheio, a transacao que pede outra conexao falha (sem prazo, travaria)', async () => {
  const pool = createFakePool({ max: 2, connectionTimeoutMillis: 50 });
  const settings = createSettingsReader(pool);

  const results = await Promise.allSettled([
    readMenu(pool, settings, { passTransactionClient: false }),
    readMenu(pool, settings, { passTransactionClient: false })
  ]);

  const failed = results.filter(result => result.status === 'rejected');
  assert.ok(failed.length >= 1, 'sem connectionTimeoutMillis, as duas esperariam para sempre');
  assert.match(failed[0].reason.message, /timeout/);
});

test('correcao: a transacao passa a propria conexao e nada trava', async () => {
  const pool = createFakePool({ max: 2, connectionTimeoutMillis: 50 });
  const settings = createSettingsReader(pool);

  const results = await Promise.all(
    Array.from({ length: 10 }, () => readMenu(pool, settings, { passTransactionClient: true }))
  );

  assert.equal(results.length, 10);
  assert.ok(results.every(timeZone => timeZone === 'America/Sao_Paulo'));
});

test('redes de seguranca do pool tem valores padrao e limites minimos', () => {
  assert.deepEqual(poolSafetyConfig({}), {
    max: 10,
    connectionTimeoutMillis: 10000,
    idle_in_transaction_session_timeout: 60000
  });
  const tooLow = poolSafetyConfig({ PG_MAX_CLIENTS: '1', PG_CONNECTION_TIMEOUT_MS: '10', PG_IDLE_IN_TRANSACTION_TIMEOUT_MS: '10' });
  assert.deepEqual(tooLow, { max: 2, connectionTimeoutMillis: 1000, idle_in_transaction_session_timeout: 5000 });
});
