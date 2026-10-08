'use strict';

// Decide se uma mensagem é pedido de descadastro de marketing (LGPD).
//
// Problema real: o cliente respondia "cancelar" à pergunta "Você vem para a reserva de hoje?".
// O sistema tratava a palavra como opt-out global: o cliente recebia "você foi descadastrado"
// e a reserva continuava de pé. Outro caso: "cancelar" com pedido em andamento.
//
// Regra adotada:
// - Frases claras ("sair", "parar", "não quero receber promoções") valem sempre.
// - Palavras soltas ambíguas ("não", "cancelar", "remover") só contam como descadastro se
//   o cliente NÃO estiver respondendo a uma pergunta nossa e TIVER recebido marketing recente.
// - Na dúvida técnica (erro ao consultar), preserva o descadastro: errar para o lado
//   do consentimento vale mais do que acertar a interpretação da palavra.

const AMBIGUOUS_WORDS = ['nao', 'cancelar', 'remover'];

const EXPLICIT_WORDS = ['sair', 'parar', 'stop', 'unsubscribe', 'descadastrar', 'descadastro'];

const EXPLICIT_PATTERNS = [
  /\bnao\s+(quero|desejo|tenho interesse).{0,35}\b(receber|mensagem|msg|promo|oferta)/,
  /\b(me|pode me)\s+(tira|tire|tirar|remove|remova|remover)\s+(da|dessa|desta)\s+(lista|campanha)/,
  /\b(pare|parar|para|cancele|cancelar)\s+(de\s+)?(mandar|enviar|me mandar|me enviar)/
];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isExplicitOptOut(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (EXPLICIT_WORDS.includes(normalized)) return true;
  return EXPLICIT_PATTERNS.some(pattern => pattern.test(normalized));
}

function isAmbiguousOptOut(text) {
  return AMBIGUOUS_WORDS.includes(normalizeText(text));
}

// deps.hasOpenQuestion(phone): o cliente tem uma pergunta nossa em aberto (ex.: "você vem?")?
// deps.hasRecentMarketing(phone): recebeu campanha ou convite de marketing nos últimos dias?
function createOptOutClassifier({ hasOpenQuestion, hasRecentMarketing, logger }) {
  return async function classifyOptOut({ phone, text }) {
    if (isExplicitOptOut(text)) return { optOut: true, reason: 'explicit' };
    if (!isAmbiguousOptOut(text)) return { optOut: false, reason: 'not_opt_out' };

    let answeringQuestion = false;
    try {
      answeringQuestion = await hasOpenQuestion(phone);
    } catch (error) {
      // Falha ao consultar a jornada nunca esconde um descadastro.
      logger?.error?.('[OPTOUT] falha ao consultar pergunta em aberto:', error?.message || error);
    }
    if (answeringQuestion) return { optOut: false, reason: 'answering_question' };

    let recentMarketing = true;
    try {
      recentMarketing = await hasRecentMarketing(phone);
    } catch (error) {
      logger?.error?.('[OPTOUT] falha ao consultar marketing recente; preservando descadastro:', error?.message || error);
    }
    return recentMarketing
      ? { optOut: true, reason: 'ambiguous_after_marketing' }
      : { optOut: false, reason: 'ambiguous_without_marketing' };
  };
}

module.exports = {
  createOptOutClassifier,
  isAmbiguousOptOut,
  isExplicitOptOut,
  normalizeText
};
