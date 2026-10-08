'use strict';

// Fase de admissão do webhook do WhatsApp, executada antes do atendimento.
//
// Regras que vieram de problemas reais em produção:
// 1. Responder sempre HTTP 200. Erro 5xx faz o provedor reenviar o evento, e o reenvio
//    vira mensagem duplicada para o cliente. Falhas internas são registradas sem payload.
// 2. Deduplicar pelo ID da mensagem antes de qualquer efeito colateral (log, CRM, resposta).
// 3. Uma palavra ambígua ("cancelar", "não") só é descadastro se o cliente não estiver
//    respondendo a uma pergunta nossa (ver src/consent/ambiguous-optout.js).
//
// Todas as dependências são injetadas: o módulo não conhece Express, banco nem provedor.
function createWebhookIntake(deps) {
  const {
    logger,
    normalizeMessage,
    shouldIgnore = () => false,
    dedup,
    recordIncoming = async () => {},
    classifyOptOut,
    onOptOut = async () => {}
  } = deps;

  return async function runWebhookIntake(req, res) {
    try {
      const message = normalizeMessage(req.body);
      if (!message || shouldIgnore(message)) {
        res.sendStatus(200);
        return { done: true, reason: 'ignored' };
      }

      if (dedup.seenBefore(message.messageId)) {
        res.status(200).json({ duplicated: true });
        return { done: true, reason: 'duplicate' };
      }

      await recordIncoming(message);

      if (!message.fromMe && classifyOptOut) {
        const decision = await classifyOptOut(message);
        if (decision.optOut) {
          await onOptOut(message, decision);
          res.sendStatus(200);
          return { done: true, reason: 'opt_out' };
        }
      }

      return { done: false, message };
    } catch (error) {
      // Nunca devolver 5xx ao provedor: registrar a causa (sem o corpo da mensagem) e encerrar.
      logger.error('[WEBHOOK] falha na admissao:', error?.message || error);
      if (!res.headersSent) res.sendStatus(200);
      return { done: true, reason: 'internal_error' };
    }
  };
}

module.exports = { createWebhookIntake };
