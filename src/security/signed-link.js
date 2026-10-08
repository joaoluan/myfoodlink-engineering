'use strict';

// Link assinado de uso específico, enviado pelo WhatsApp (ex.: "remarcar minha reserva").
// - HMAC-SHA256: o cliente não consegue trocar o ID da reserva no link.
// - Escopo mínimo: identifica UMA reserva e os últimos dígitos do telefone dono dela.
// - Validade limitada: expira quando a reserva começa, e nunca passa de 14 dias.
// - Comparação em tempo constante para não vazar a assinatura por tempo de resposta.

const crypto = require('node:crypto');

const MAX_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_TOKEN_LENGTH = 400;

function createSignedLink({ secret, purpose = 'reschedule', now = Date.now } = {}) {
  if (!secret) throw new Error('signed_link_secret_required');

  function signature(body) {
    return crypto.createHmac('sha256', secret).update(`${purpose}:${body}`).digest('base64url');
  }

  function sign({ resourceId, phone, expiresAt } = {}) {
    const id = Number(resourceId);
    const phoneKey = String(phone || '').replace(/\D/g, '').slice(-8);
    if (!Number.isInteger(id) || id < 1 || phoneKey.length < 8) return '';
    const limit = now() + MAX_TTL_MS;
    const requested = expiresAt instanceof Date ? expiresAt.getTime() : Number(expiresAt);
    const exp = Number.isFinite(requested) ? Math.min(requested, limit) : limit;
    if (!(exp > now())) return '';
    const body = Buffer.from(JSON.stringify({ r: id, p: phoneKey, exp })).toString('base64url');
    return `${body}.${signature(body)}`;
  }

  // Devolve { resourceId, phoneKey } ou null. Nunca lança erro para entrada de cliente.
  function verify(token) {
    const value = String(token || '');
    if (!value || value.length > MAX_TOKEN_LENGTH) return null;
    const [body, sig] = value.split('.');
    if (!body || !sig) return null;
    const expected = Buffer.from(signature(body));
    const received = Buffer.from(sig);
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
    let payload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (!Number.isInteger(payload.r) || typeof payload.p !== 'string' || !(payload.exp > now())) return null;
    return { resourceId: payload.r, phoneKey: payload.p };
  }

  return { sign, verify };
}

module.exports = { createSignedLink };
