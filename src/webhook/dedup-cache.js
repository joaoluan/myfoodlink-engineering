'use strict';

// Exemplo em memória: compartilha uma admissão em andamento e só lembra o ID
// depois do sucesso. Uma falha libera o ID para uma nova tentativa.
// Não é uma fila durável nem uma trava entre processos; veja o contrato no caso 01.
function createDedupCache({ windowMs = 30 * 60 * 1000, maxEntries = 10000, now = Date.now } = {}) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new TypeError('windowMs deve ser positivo');
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) throw new TypeError('maxEntries deve ser inteiro positivo');
  const seen = new Map();
  const pending = new Map();

  function prune() {
    const limit = now() - windowMs;
    for (const [id, at] of seen) {
      if (at > limit) break;
      seen.delete(id);
    }
  }

  // Apenas IDs concluídos podem ser removidos; uma admissão em andamento não é expulsa.
  function evictOldest() {
    while (seen.size >= maxEntries) {
      seen.delete(seen.keys().next().value);
    }
  }

  async function runOnce(messageId, operation) {
    if (typeof messageId !== 'string' || !messageId.trim()) throw new TypeError('messageId obrigatorio');
    prune();
    if (seen.has(messageId)) return { duplicate: true };
    if (pending.has(messageId)) {
      // Só confirmar a cópia depois que a tentativa original também tiver sucesso.
      await pending.get(messageId);
      return { duplicate: true };
    }
    if (pending.size >= maxEntries) throw new Error('limite de admissoes em andamento');

    // Registrar a Promise antes de executar a operação impede duas gravações simultâneas.
    const task = Promise.resolve().then(operation).then(value => {
      prune();
      evictOldest();
      seen.set(messageId, now());
      return value;
    }).finally(() => pending.delete(messageId));
    pending.set(messageId, task);
    return { duplicate: false, value: await task };
  }

  return { runOnce, size: () => seen.size, pendingSize: () => pending.size };
}

module.exports = { createDedupCache };
