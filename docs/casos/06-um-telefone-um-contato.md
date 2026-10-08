# 06 · O mesmo cliente duplicado no CRM

**Área:** dados · qualidade de cadastro

## Sintoma
O mesmo cliente aparecia duas ou três vezes no CRM, com histórico, fidelidade e consentimento espalhados.

## Causa
O WhatsApp entrega o número ora com o nono dígito, ora sem; o cadastro pelo site vinha com ou sem o 55; e celulares das faixas novas (9 1xxx a 9 5xxx) eram rejeitados. O WhatsApp também pode entregar um LID, identificador que não é telefone.

## Solução
- **Forma canônica única:** 55 + DDD + número, com o nono dígito em celulares e sem ele em fixos, com validação de DDD.
- **Chave de identidade por contato** (`phone_key`), com índice único no banco: um telefone, um contato. LID vira chave própria.
- **Variantes de busca** para encontrar registros antigos gravados antes da padronização.

## Código e testes
- [`src/phone/br-phone.js`](../../src/phone/br-phone.js)
- [`test/br-phone.test.js`](../../test/br-phone.test.js)

## Referência
PRs #115 e #119 do repositório privado do router.
