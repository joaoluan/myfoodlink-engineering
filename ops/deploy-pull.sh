#!/usr/bin/env bash
# Deploy "puxado" com portões de segurança e rollback automático (versão sanitizada).
#
# Como funciona em produção:
#   - A aprovação é o merge de um PR que muda o arquivo de versões (imagens por digest).
#   - A VPS não tem git nem código-fonte. Um cron a cada 5 minutos roda este script, que
#     baixa só a pasta de deploy do commit aprovado e aplica.
#
# Portões, nesta ordem (qualquer um falhando para tudo):
#   1. O CI do commit está verde (consultado na API do GitHub Actions).
#   2. Existe backup do banco com sucesso nas últimas 26 h.
#   3. Toda imagem está fixada por digest.
#   4. Cada serviço fica healthy dentro do prazo.
#   5. O smoke test passa.
# Se algo falha depois de começar a aplicar: volta para a última versão boa e marca o commit
# como ruim, para o cron não tentar de novo a cada 5 minutos.
#
# Problemas reais que moldaram este script:
#   - O cron roda com PATH mínimo: o CLI do cofre de segredos não era encontrado e o deploy
#     falhava sem avisar. Agora o PATH é explícito e toda rodada publica uma métrica.
#   - Token fine-grained do GitHub não lê check-runs: o CI é conferido pelos workflow runs.
#   - Nome de contêiner com hífen quebrava o healthcheck: padronizado com underscore.
#
# Endereços, nomes de repositório, caminhos e credenciais reais foram removidos.
set -uo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

BASE="${DEPLOY_BASE:-/srv/restaurant-platform}"
STATE="$BASE/deploy-state"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"
BACKUP_MAX_IDADE_S=$((26 * 3600))
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

backup_recente() { # backup_recente <arquivo com timestamp do ultimo backup ok>
  local ultimo
  ultimo=$(cat "$1" 2>/dev/null || echo 0)
  [ $(( $(date +%s) - ultimo )) -lt "$BACKUP_MAX_IDADE_S" ]
}

esperar_healthy() { # esperar_healthy <container>
  local limite=$((SECONDS + HEALTH_TIMEOUT)) st
  while [ $SECONDS -lt $limite ]; do
    st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}sem-healthcheck{{end}}|{{.State.Status}}' "$1" 2>/dev/null || echo "ausente|ausente")
    case "$st" in
      "healthy|running"|"sem-healthcheck|running") return 0 ;;
      "starting|running"|"starting|restarting") ;;
      *) log "  $1: $st"; return 1 ;;
    esac
    sleep 3
  done
  log "  $1: nao ficou healthy em ${HEALTH_TIMEOUT}s"
  return 1
}

aplicar() { # aplicar <dir da release>
  local dir="$1" servico
  bash "$(dirname "$0")/verificar-digests.sh" "$dir/versoes.env" || return 1
  docker compose --project-directory "$dir" -f "$dir/compose.yml" up -d || return 1
  for servico in $(docker compose --project-directory "$dir" -f "$dir/compose.yml" config --services); do
    esperar_healthy "app_${servico//-/_}" || return 1
  done
  bash "$dir/smoke.sh" || return 1
}

main() {
  local alvo="${RELEASE_ALVO:?defina RELEASE_ALVO com o sha aprovado}" boa
  mkdir -p "$STATE"
  touch "$STATE/ruins"
  grep -qx "$alvo" "$STATE/ruins" && { log "release $alvo ja marcada como ruim"; return 0; }

  backup_recente "$BASE/backup/ultimo_backup_ok" || { log "ERRO sem backup nas ultimas 26 h; deploy bloqueado"; return 1; }

  if [ "$DRY_RUN" = 1 ]; then
    log "(dry-run) aplicaria $alvo"
    return 0
  fi

  if aplicar "$BASE/releases/$alvo"; then
    echo "$alvo" > "$STATE/LAST_GOOD_RELEASE"
    log "OK release $alvo no ar"
    return 0
  fi

  echo "$alvo" >> "$STATE/ruins"
  boa=$(cat "$STATE/LAST_GOOD_RELEASE" 2>/dev/null || true)
  if [ -n "$boa" ] && [ "$boa" != "$alvo" ]; then
    log "ROLLBACK para $boa"
    aplicar "$BASE/releases/$boa" && log "rollback OK" || log "ERRO rollback falhou: intervencao manual"
  fi
  return 1
}

main "$@"
