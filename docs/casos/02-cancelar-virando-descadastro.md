# 02 · "Cancelar" virando descadastro de marketing

**Área:** produto · LGPD · regras de negócio

## Sintoma
Um cliente respondeu "cancelar" à pergunta "Você vem para a reserva de hoje?". Recebeu "você foi descadastrado das promoções", e a reserva continuou de pé. Em outro caso, "cancelar" com um pedido em andamento descadastrava o cliente em vez de cancelar o pedido.

## Causa
"cancelar", "não" e "remover" estavam na lista de palavras de descadastro global e eram avaliados antes da conversa. A mesma palavra tem significados diferentes conforme o contexto.

## Solução
- Frases claras ("sair", "parar", "não quero receber promoções") valem **sempre**.
- Palavras soltas ambíguas só contam como descadastro se o cliente **não** está respondendo a uma pergunta nossa **e** recebeu marketing nos últimos 7 dias.
- **Na dúvida técnica, preserva o descadastro**: se a consulta ao banco falhar, o pedido de sair é respeitado. Errar para o lado do consentimento vale mais do que acertar a interpretação.

## Código e testes
- [`src/consent/ambiguous-optout.js`](../../src/consent/ambiguous-optout.js)
- [`test/ambiguous-optout.test.js`](../../test/ambiguous-optout.test.js)

## Referência
PRs #83 e #100 do repositório privado do router.

## O que aprendi
Regra de LGPD não é só "ter um botão de sair". É decidir o que fazer no caso ambíguo, e documentar por quê.
