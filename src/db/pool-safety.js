'use strict';

// Deadlock de pool no PostgreSQL: o caso que travava o cardápio.
//
// Sintoma em produção (reproduzido no staging): com cerca de 10 leituras simultâneas do
// cardápio, o serviço parava de responder para sempre, mas o /ready continuava 200 e o
// healthcheck não percebia nada.
//
// Causa: a leitura abria uma transação (1 conexão do pool) e, dentro dela, buscava o fuso
// horário do restaurante com OUTRA conexão do mesmo pool. Com o pool de 10 conexões tomado
// por transações que esperavam uma 11ª conexão, ninguém terminava. O driver `pg` espera
// conexão sem limite de tempo por padrão.
//
// Correção em duas camadas:
// 1. Quem está numa transação passa a própria conexão adiante (ver createSettingsReader).
// 2. Redes de segurança no pool: espera por conexão com prazo e o Postgres encerra
//    transação parada. Um bug desse tipo passa a derrubar requisições, não o serviço inteiro.

function poolSafetyConfig(env = process.env) {
  return {
    max: Math.max(2, Number(env.PG_MAX_CLIENTS || 10)),
    connectionTimeoutMillis: Math.max(1000, Number(env.PG_CONNECTION_TIMEOUT_MS || 10000)),
    idle_in_transaction_session_timeout: Math.max(5000, Number(env.PG_IDLE_IN_TRANSACTION_TIMEOUT_MS || 60000))
  };
}

// `client` é opcional: quem já está dentro de uma transação passa a sua conexão.
// Pedir outra ao pool segurando uma é o que esgota o pool sob concorrência.
function createSettingsReader(pool) {
  return {
    async getTimeZone(client = pool) {
      const result = await client.query('SELECT value FROM tenant_settings WHERE section = $1', ['hours']);
      return result.rows[0]?.value?.timeZone || 'America/Sao_Paulo';
    }
  };
}

module.exports = { createSettingsReader, poolSafetyConfig };
