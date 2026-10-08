'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRedisReconnectStrategy } = require('../src/redis/reconnect-strategy');

test('no boot, desiste depois do limite para subir com o fallback em memoria', () => {
  const { strategy } = createRedisReconnectStrategy({ maxInitialRetries: 2 });

  assert.equal(strategy(0), 250);
  assert.equal(strategy(1), 500);
  assert.equal(strategy(2), false);
});

test('depois de conectar uma vez, nunca desiste (queda curta do Redis num deploy)', () => {
  const { strategy, markConnected } = createRedisReconnectStrategy({ maxInitialRetries: 2 });
  markConnected();

  assert.equal(strategy(2), 750);
  assert.equal(strategy(100), 5000, 'espera limitada a 5 s');
  assert.notEqual(strategy(10000), false);
});
