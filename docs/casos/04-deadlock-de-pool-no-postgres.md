# 04 · O cardápio que travava para sempre (deadlock de pool)

**Área:** banco de dados · concorrência · observabilidade

## Sintoma
Reproduzido no staging: com cerca de 10 acessos simultâneos ao cardápio, o serviço parava de responder **para sempre**. O `/ready` continuava respondendo 200, então o healthcheck não via nada.

## Causa
A leitura do cardápio abria uma transação (1 conexão do pool) e, dentro dela, buscava o fuso horário do restaurante pedindo **outra** conexão ao mesmo pool. Com as 10 conexões ocupadas por transações esperando uma 11ª, ninguém terminava. O driver `pg` espera por conexão sem prazo por padrão.

## Solução
1. **Causa raiz:** quem está numa transação passa a própria conexão adiante (`getTimeZone(client)`).
2. **Redes de segurança no pool:**
   - `connectionTimeoutMillis` (10 s): quem espera conexão recebe erro em vez de esperar para sempre;
   - `idle_in_transaction_session_timeout` (60 s): o Postgres encerra transação parada.

   Um bug desse tipo passa a derrubar **requisições**, não o serviço inteiro.

## Código e testes
- [`src/db/pool-safety.js`](../../src/db/pool-safety.js)
- [`test/pool-safety.test.js`](../../test/pool-safety.test.js): reproduz o bug com um pool de 2 conexões e prova a correção com 10 leituras simultâneas.

## Referência
PR #156 do repositório privado do router.

## O que aprendi
Healthcheck verde não quer dizer serviço saudável. E todo recurso compartilhado precisa de prazo.
