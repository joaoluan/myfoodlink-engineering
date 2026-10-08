# 01 · Cliente recebendo a mesma resposta duas vezes

**Área:** backend · webhooks · idempotência

## Sintoma
Em horários de pico, alguns clientes recebiam a mesma resposta automática duas vezes no WhatsApp.

## Causa
A Evolution API reenvia o evento quando o webhook demora ou responde erro, e repete eventos quando a instância reconecta. O serviço tratava cada entrega como uma mensagem nova. Pior: quando algo falhava internamente e o webhook devolvia 5xx, o próprio erro provocava o reenvio.

## Correção do exemplo público

Na revisão deste demonstrativo, foi encontrada uma falha na solução anterior: o ID era marcado como visto antes de `recordIncoming`. Se o banco falhasse, o endpoint respondia 200 e um reenvio era descartado como duplicado, mesmo sem uma mensagem gravada. O teste antigo exigia esse 200, mas não verificava a recuperação.

- **Compartilhar a admissão em andamento:** `dedup.runOnce(messageId, operation)` reserva uma Promise antes de executar a operação. Entregas simultâneas do mesmo ID aguardam essa tentativa, em vez de gravar em paralelo ou confirmar sucesso antecipadamente.
- **Marcar como concluído depois do sucesso:** a janela de deduplicação só começa após a persistência e o tratamento de opt-out, quando aplicável. Uma falha remove a reserva e não registra o ID como concluído.
- **Falha interna responde 503:** o exemplo não confirma uma admissão que falhou. Um provedor configurado para repetir entregas com erro pode tentar novamente; a política real de reenvio precisa ser verificada na integração.
- **200 para eventos ignorados ou duplicatas de uma admissão bem-sucedida.** Uma duplicata de uma tentativa ainda em andamento só recebe 200 depois do sucesso da original; se ela falhar, ambas recebem 503.

## Contrato e limites do demonstrativo

Este repositório não é o serviço de produção e esta revisão não altera o produto privado. O cache é em memória, com limite para IDs concluídos e para operações em andamento; ele não fornece persistência, coordenação entre processos ou garantia de processamento após reinício.

`recordIncoming` é uma dependência obrigatória. Na implementação real, precisa salvar o evento de forma **durável e idempotente por ID de mensagem**, no escopo do restaurante, por exemplo com chave única e operação transacional. O fake dos testes usa memória apenas para demonstrar o contrato. `onOptOut` também precisa tolerar repetição: uma falha posterior à gravação pode fazer o fluxo ser tentado novamente.

O retorno `done: false` apenas conclui a admissão e entrega a mensagem ao chamador. O atendimento posterior e sua resposta HTTP não são implementados aqui. Para confirmar 200 com segurança e recuperar falhas posteriores, o chamador deve usar o evento persistido como inbox/fila, com estados de processamento e tentativas controladas. Reenviar o webhook não substitui a recuperação desse processamento, e este exemplo não promete resposta externa exatamente uma vez.

## Código e testes
- [`src/webhook/intake.js`](../../src/webhook/intake.js) e [`src/webhook/dedup-cache.js`](../../src/webhook/dedup-cache.js)
- [`test/webhook-intake.test.js`](../../test/webhook-intake.test.js): falha de gravação seguida de recuperação, entregas simultâneas com sucesso e falha, repetição do opt-out, log sem corpo da mensagem, expiração e limites do cache.

## O que aprendi
Evitar duplicação não basta: é preciso também evitar confirmar uma mensagem que não foi admitida e ter um caminho explícito de recuperação. Testes devem cobrir a falha seguida de uma nova tentativa, além do caminho de sucesso.
