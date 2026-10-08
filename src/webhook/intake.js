'use strict';

// Fase de admissão do webhook do WhatsApp, executada antes do atendimento.
//
// Exemplo demonstrativo revisado para não confirmar mensagens cuja admissão falhou:
// 1. HTTP 200 para eventos ignorados ou cópias de uma admissão bem-sucedida.
//    Falha interna retorna 503, liberando o ID para uma nova tentativa.
// 2. Compartilhar admissões simultâneas e marcar o ID como concluído só após o sucesso.
// 3. Uma palavra ambígua ("cancelar", "não") só é descadastro se o cliente não estiver
//    respondendo a uma pergunta nossa (ver src/consent/ambiguous-optout.js).
//
// recordIncoming deve persistir de forma durável e idempotente por messageId.
// done:false entrega o fluxo ao chamador, que ainda deve responder e recuperar falhas
// posteriores usando o registro persistido. Este módulo não implementa esse worker.
// Todas as dependências são injetadas: o módulo não conhece Express, banco nem provedor.
function createWebhookIntake(deps) {
  const {
    logger,
    normalizeMessage,
    shouldIgnore = () => false,
    dedup,
    recordIncoming,
    classifyOptOut,
    onOptOut = async () => {}
  } = deps;
  if (typeof recordIncoming !== 'function') throw new TypeError('recordIncoming obrigatorio');

  return async function runWebhookIntake(req, res) {
    try {
      const message = normalizeMessage(req.body);
      if (!message || shouldIgnore(message)) {
        res.sendStatus(200);
        return { done: true, reason: 'ignored' };
      }

      const admission = await dedup.runOnce(message.messageId, async () => {
        await recordIncoming(message);
        if (!message.fromMe && classifyOptOut) {
          const decision = await classifyOptOut(message);
          if (decision.optOut) {
            // O adaptador deve ser idempotente: uma tentativa pode falhar após persistir.
            await onOptOut(message, decision);
            return { optOut: true };
          }
        }
        return { optOut: false };
      });

      if (admission.duplicate) {
        res.status(200).json({ duplicated: true });
        return { done: true, reason: 'duplicate' };
      }

      if (admission.value.optOut) {
        res.sendStatus(200);
        return { done: true, reason: 'opt_out' };
      }

      return { done: false, message };
    } catch (error) {
      // Não confirmar uma admissão que falhou. Não incluir o corpo da mensagem no log.
      logger.error('[WEBHOOK] falha na admissao:', error?.message || error);
      if (!res.headersSent) res.sendStatus(503);
      return { done: true, reason: 'internal_error' };
    }
  };
}

module.exports = { createWebhookIntake };
