'use strict';

// Plataforma multi-tenant com pagamento por conta conectada (Stripe Connect / Mercado Pago).
//
// Problema real: cada endpoint de webhook Connect da Stripe recebe eventos de TODAS as contas
// conectadas à plataforma. O restaurante A recebia evento da conta do restaurante B, não
// achava o pedido e respondia 500. A Stripe reenvia eventos com erro e, depois de muitas
// falhas, desativa o endpoint, derrubando o recebimento de pagamentos do restaurante A.
//
// Correção: evento de conta que este restaurante nunca conectou é de outro tenant.
// Responde 200 e ignora. Conta conhecida (atual ou histórica, mesmo revogada) segue o fluxo.
//
// Regra complementar: um gateway por restaurante. Trocar de provedor exige desconectar antes,
// garantido no backend e não só na tela.

function createConnectWebhookGuard({ getCurrentConnection, getConnectionHistory }) {
  function matches(connection, provider, accountId) {
    return Boolean(connection)
      && connection.provider === provider
      && String(connection.providerAccountId || '') === String(accountId);
  }

  async function isKnownAccount(provider, accountId) {
    if (!provider || !accountId) return false;
    if (matches(await getCurrentConnection(), provider, accountId)) return true;
    const history = await getConnectionHistory();
    return history.some(item => matches(item, provider, accountId));
  }

  // Devolve { accept: false, status: 200 } para evento de outro tenant: nunca 4xx/5xx.
  async function check({ provider, accountId }) {
    if (!accountId) return { accept: true };
    if (await isKnownAccount(provider, accountId)) return { accept: true };
    return { accept: false, status: 200, body: { ok: true, ignored: true } };
  }

  return { check, isKnownAccount };
}

function assertSingleGateway(current, requestedProvider) {
  if (current?.status === 'connected' && current.provider && current.provider !== requestedProvider) {
    const error = new Error('payment_provider_already_connected');
    error.statusCode = 409;
    throw error;
  }
}

module.exports = { assertSingleGateway, createConnectWebhookGuard };
