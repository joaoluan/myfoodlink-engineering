# 07 · Backup diário perdido por disputa de lock

**Área:** operação · backup · incidentes

## O incidente (06/10/2026, 03:15 UTC)
A coleta de métricas (a cada 5 min) e o backup base diário do PostgreSQL começaram no mesmo minuto e disputaram o mesmo arquivo de lock. A coleta entrou primeiro; o backup registrou "outra execução em andamento" e **não rodou**.

Ninguém percebeu na hora: a métrica de "último backup OK" ainda mostrava o do dia anterior (24 h). O deploy, que exige backup com menos de 26 h, ficaria bloqueado no dia seguinte.

## Resposta
1. **Imediata:** cron da coleta deslocado de `*/5` para `2-57/5`; backup manual executado e verificado (`wal-verify` OK, cópia no storage externo, métricas renovadas).
2. **Definitiva no código:**
   - a coleta de métricas pode **pular** uma rodada se o lock estiver ocupado;
   - o backup **espera** o lock por até 300 s e **falha alto** se não conseguir.
3. Incidente documentado na auditoria de produção.

## Código e testes
- [`ops/backup-lock.sh`](../../ops/backup-lock.sh)
- [`test/ops-scripts.test.js`](../../test/ops-scripts.test.js): simula a coleta segurando o lock e prova que o backup espera e executa.

## Referência
PR #45 do repositório privado de infraestrutura.

## O que aprendi
O backup que "rodou" não basta: o que importa é a métrica de último sucesso e um alerta quando ela envelhece. Esse alerta existe hoje.
