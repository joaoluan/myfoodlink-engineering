# 01 · Cliente recebendo a mesma resposta duas vezes

**Área:** backend · webhooks · idempotência

## Sintoma
Em horários de pico, alguns clientes recebiam a mesma resposta automática duas vezes no WhatsApp.

## Causa
A Evolution API reenvia o evento quando o webhook demora ou responde erro, e repete eventos quando a instância reconecta. O serviço tratava cada entrega como uma mensagem nova. Pior: quando algo falhava internamente e o webhook devolvia 5xx, o próprio erro provocava o reenvio.

## Solução
- **Deduplicação pelo ID da mensagem** antes de qualquer efeito colateral (log, CRM, resposta). Checar e marcar é uma operação só, sem espaço entre as duas.
- **HTTP 200 sempre** para o provedor. Erro interno é registrado (sem o conteúdo da mensagem, por LGPD) e não vira reenvio.
- Em produção, a deduplicação usa Redis com fallback em memória e janela de 30 minutos.

## Código e testes
- [`src/webhook/intake.js`](../../src/webhook/intake.js) e [`src/webhook/dedup-cache.js`](../../src/webhook/dedup-cache.js)
- [`test/webhook-intake.test.js`](../../test/webhook-intake.test.js): reenvio processado uma vez, falha interna responde 200, log sem conteúdo, limite de memória.

## O que aprendi
Em integração com terceiros, "entregue pelo menos uma vez" é a regra. Quem recebe precisa ser idempotente.
