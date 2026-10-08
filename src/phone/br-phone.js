'use strict';

// Um telefone, um contato.
//
// Problema real: o mesmo cliente aparecia duas ou três vezes no CRM. O WhatsApp entrega o
// número ora com o nono dígito, ora sem; o cadastro pelo site vinha com ou sem o 55; e
// celulares das faixas novas (9 1xxx a 9 5xxx) eram rejeitados. Resultado: histórico,
// fidelidade e consentimento espalhados entre "clientes" diferentes.
//
// Correção: uma forma canônica (55 + DDD + número, com o nono dígito em celulares e sem ele
// em fixos), validação de DDD e uma chave de identidade única por contato. No banco, a mesma
// regra existe como coluna gerada com índice único.

const VALID_DDD = /^(1[1-9]|2[12478]|3[1-578]|4[1-9]|5[1345]|6[1-9]|7[134579]|8[1-9]|9[1-9])/;

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

// Retorna 55DDDNÚMERO ou null quando não é telefone brasileiro válido.
function canonicalizeBrazilianPhone(value) {
  const digits = normalizeDigits(value);
  let national = null;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) national = digits.slice(2);
  else if (digits.length === 10 || digits.length === 11) national = digits;
  if (!national || !VALID_DDD.test(national)) return null;

  const ddd = national.slice(0, 2);
  const local = national.slice(2);
  // Celular com 9 dígitos: qualquer faixa depois do 9.
  if (local.length === 9) return /^9\d{8}$/.test(local) ? `55${national}` : null;
  // Fixo: 8 dígitos começando em 2 a 5.
  if (/^[2-5]\d{7}$/.test(local)) return `55${national}`;
  // Celular no formato antigo, sem o nono dígito: acrescenta.
  if (/^[6-9]\d{7}$/.test(local)) return `55${ddd}9${local}`;
  return null;
}

// Chave de identidade do contato. O WhatsApp pode entregar um LID (identificador que não é
// telefone, terminado em @lid); ele vira uma chave própria em vez de "telefone inválido".
function buildContactKey(remoteNumber, remoteJid = '') {
  const digits = normalizeDigits(remoteNumber);
  if (String(remoteJid).endsWith('@lid')) return `lid:${digits}`;
  return canonicalizeBrazilianPhone(digits) || `raw:${digits}`;
}

// Variantes para buscar registros antigos gravados antes da padronização.
function lookupVariants(value) {
  const digits = normalizeDigits(value);
  if (!digits) return [];
  const variants = new Set([digits]);
  const canonical = canonicalizeBrazilianPhone(digits);
  if (canonical) {
    variants.add(canonical);
    variants.add(canonical.slice(2));
    if (canonical.length === 13) {
      variants.add(`${canonical.slice(0, 4)}${canonical.slice(5)}`);
      variants.add(`${canonical.slice(2, 4)}${canonical.slice(5)}`);
    }
  }
  return Array.from(variants);
}

module.exports = {
  buildContactKey,
  canonicalizeBrazilianPhone,
  lookupVariants,
  normalizeDigits
};
