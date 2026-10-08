'use strict';

// Lembra os IDs de mensagem já processados por uma janela de tempo.
// A Evolution API (e o próprio WhatsApp) reenviam o mesmo evento quando o webhook demora
// ou quando a instância reconecta. Sem isto, o cliente recebe a mesma resposta duas vezes.
// Versão em memória; no MyFoodLink a mesma interface é implementada em Redis com fallback local.
function createDedupCache({ windowMs = 30 * 60 * 1000, maxEntries = 10000, now = Date.now } = {}) {
  const seen = new Map();

  function prune() {
    const limit = now() - windowMs;
    for (const [id, at] of seen) {
      if (at > limit) break;
      seen.delete(id);
    }
  }

  // Abre espaço antes de inserir: a memória nunca passa de `maxEntries` IDs.
  function evictOldest() {
    while (seen.size >= maxEntries) {
      seen.delete(seen.keys().next().value);
    }
  }

  // Devolve true se o ID já foi visto dentro da janela; senão registra e devolve false.
  // Operação única (checa e marca) para não abrir espaço entre a verificação e o registro.
  function seenBefore(messageId) {
    if (!messageId) return false;
    prune();
    if (seen.has(messageId)) return true;
    evictOldest();
    seen.set(messageId, now());
    return false;
  }

  return { seenBefore, size: () => seen.size };
}

module.exports = { createDedupCache };
