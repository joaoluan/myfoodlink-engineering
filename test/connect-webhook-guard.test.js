'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { assertSingleGateway, createConnectWebhookGuard } = require('../src/payments/connect-webhook-guard');

const guard = createConnectWebhookGuard({
  getCurrentConnection: async () => ({ provider: 'stripe', providerAccountId: 'acct_restaurante_a', status: 'connected' }),
  getConnectionHistory: async () => [{ provider: 'stripe', providerAccountId: 'acct_restaurante_a_antiga', status: 'revoked' }]
});

test('evento de conta de outro restaurante e ignorado com 200, nunca 500', async () => {
  const result = await guard.check({ provider: 'stripe', accountId: 'acct_restaurante_b' });

  assert.equal(result.accept, false);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, ignored: true });
});

test('evento da conta atual e da conta antiga revogada seguem o fluxo', async () => {
  assert.equal((await guard.check({ provider: 'stripe', accountId: 'acct_restaurante_a' })).accept, true);
  assert.equal((await guard.check({ provider: 'stripe', accountId: 'acct_restaurante_a_antiga' })).accept, true);
});

test('mesmo ID de conta em outro provedor nao e reconhecido', async () => {
  assert.equal(await guard.isKnownAccount('mercadopago', 'acct_restaurante_a'), false);
});

test('um gateway por restaurante: trocar exige desconectar antes', () => {
  assert.throws(
    () => assertSingleGateway({ provider: 'stripe', status: 'connected' }, 'mercadopago'),
    error => error.message === 'payment_provider_already_connected' && error.statusCode === 409
  );
  assert.doesNotThrow(() => assertSingleGateway({ provider: 'stripe', status: 'disconnected' }, 'mercadopago'));
  assert.doesNotThrow(() => assertSingleGateway({ provider: 'stripe', status: 'connected' }, 'stripe'));
});
