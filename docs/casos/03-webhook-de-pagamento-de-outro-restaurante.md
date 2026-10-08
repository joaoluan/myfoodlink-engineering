# 03 · Webhook de pagamento de outro restaurante derrubando o endpoint

**Área:** pagamentos · multi-tenant · resiliência

## Sintoma
Logs de erro 500 no webhook de pagamento de um restaurante, para pedidos que não existiam nele.

## Causa
No Stripe Connect, cada endpoint de webhook recebe eventos de **todas** as contas conectadas à plataforma. O restaurante A recebia o evento da conta do restaurante B, não achava o pedido e respondia 500. A Stripe reenvia eventos com erro e, depois de falhas repetidas, **desativa o endpoint**, o que derrubaria o recebimento de pagamentos do restaurante A.

## Solução
- Evento de uma conta que este restaurante **nunca conectou** é de outro tenant: responde **200 e ignora**.
- Conta conhecida, atual ou histórica (mesmo revogada, para reembolsos antigos), segue o fluxo normal.
- **Um gateway por restaurante**: trocar de provedor exige desconectar o atual. Antes a regra existia só na tela; agora o backend responde 409.

## Código e testes
- [`src/payments/connect-webhook-guard.js`](../../src/payments/connect-webhook-guard.js)
- [`test/connect-webhook-guard.test.js`](../../test/connect-webhook-guard.test.js)

## Referência
PR #152 do repositório privado do router.

## O que aprendi
Em multi-tenant, todo dado que chega de fora precisa responder "isto é deste cliente?" antes de qualquer outra coisa.
