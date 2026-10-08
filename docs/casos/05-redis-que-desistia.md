# 05 · Redis que desistia de reconectar depois de um deploy

**Área:** resiliência · infraestrutura

## Sintoma
Depois de recriar o contêiner do Redis, o serviço ficava com `/ready` em 503 até alguém reiniciá-lo manualmente.

## Causa
A estratégia de reconexão desistia após 2 tentativas (~1,5 s). Essa regra fazia sentido no boot (subir com fallback em memória quando não há Redis), mas valia também depois de horas conectado. A queda curta da recriação esgotava as tentativas.

## Solução
O limite vale **só para o boot**. Depois da primeira conexão bem-sucedida, o cliente tenta para sempre, com espera crescente de no máximo 5 s.

## Código e testes
- [`src/redis/reconnect-strategy.js`](../../src/redis/reconnect-strategy.js)
- [`test/redis-reconnect.test.js`](../../test/redis-reconnect.test.js)

## Referência
PR #155 do repositório privado do router.
