'use strict';

// Estratégia de reconexão do cliente Redis (`reconnectStrategy` do node-redis).
//
// Problema real: a estratégia desistia depois de 2 tentativas (~1,5 s) também quando o
// serviço já estava conectado havia horas. Uma queda curta do Redis, como a recriação do
// contêiner num deploy, deixava o serviço sem Redis e com /ready em 503 até alguém
// reiniciá-lo manualmente.
//
// Correção: o limite de tentativas vale só para o boot (para o serviço subir com o
// fallback em memória quando o Redis não existe). Depois da primeira conexão, nunca desiste:
// tenta para sempre, com espera crescente de no máximo 5 s.
function createRedisReconnectStrategy({
  maxInitialRetries = 2,
  initialMaxDelayMs = 1000,
  maxDelayMs = 5000,
  stepMs = 250
} = {}) {
  let hasConnected = false;

  function strategy(retries) {
    if (!hasConnected) {
      if (retries >= maxInitialRetries) return false;
      return Math.min((retries + 1) * stepMs, initialMaxDelayMs);
    }
    return Math.min((retries + 1) * stepMs, maxDelayMs);
  }

  // Ligar no evento 'ready' do cliente.
  function markConnected() {
    hasConnected = true;
  }

  return { strategy, markConnected };
}

module.exports = { createRedisReconnectStrategy };
