#!/usr/bin/env bash
# Backup diário do PostgreSQL e coleta de métricas compartilhando o mesmo lock.
#
# Incidente real: às 03:15 a coleta de métricas (a cada 5 min) e o backup diário começaram
# no mesmo minuto. A coleta pegou o lock primeiro e o backup saiu com
# "outra execução em andamento". Ninguém percebeu na hora: a métrica de "último backup OK"
# ainda mostrava o do dia anterior. O deploy, que exige backup com menos de 26 h, seria
# bloqueado no dia seguinte.
#
# Correção (além de deslocar o cron da coleta para 2-57/5):
#   - metricas: pode pular uma rodada se o lock estiver ocupado (é barato e roda de novo em 5 min);
#   - backup:   ESPERA o lock por até BACKUP_LOCK_TIMEOUT segundos e falha alto se não conseguir.
#
# Uso: backup-lock.sh [backup|metricas]
# Nesta versão didática, os comandos reais (wal-g backup-push, coleta) são variáveis
# BACKUP_CMD e METRICAS_CMD, para o script poder ser testado sem banco.
set -euo pipefail

MODO="${1:-backup}"
ESTADO="${BACKUP_ESTADO_DIR:-${HOME}/.local/state/restaurant-platform}"
LOCK="$ESTADO/backup.lock"
BACKUP_CMD="${BACKUP_CMD:-echo backup-executado}"
METRICAS_CMD="${METRICAS_CMD:-echo metricas-coletadas}"

case "$MODO" in
  backup|metricas) ;;
  *) echo "uso: $0 [backup|metricas]" >&2; exit 2 ;;
esac

mkdir -p "$ESTADO"
log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

exec 9>"$LOCK"
if [ "$MODO" = metricas ]; then
  if ! flock -n 9; then
    log "outra execucao em andamento; coleta de metricas adiada"
    exit 0
  fi
  $METRICAS_CMD
  exit 0
fi

# O backup diário nunca pode ser descartado só porque a coleta começou antes.
if ! flock -w "${BACKUP_LOCK_TIMEOUT:-300}" 9; then
  log "ERRO: backup nao conseguiu obter o lock em ${BACKUP_LOCK_TIMEOUT:-300}s"
  exit 1
fi
$BACKUP_CMD
date +%s > "$ESTADO/ultimo_backup_ok"
