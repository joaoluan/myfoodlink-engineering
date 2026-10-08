#!/usr/bin/env bash
# Gate de CI: toda imagem de produção precisa estar fixada por digest (@sha256:...).
#
# Por quê: uma tag como `:latest` ou `:v1` pode apontar para outra imagem amanhã. Com digest,
# o que foi testado no staging é exatamente o que sobe em produção, e o rollback volta para
# bytes conhecidos.
#
# Uso: verificar-digests.sh arquivo-de-versoes.env
set -euo pipefail

ARQUIVO="${1:?uso: $0 versoes.env}"
falhas=0
total=0
while IFS='=' read -r var img; do
  total=$((total + 1))
  case "$img" in
    *@sha256:*) echo "ok $var" ;;
    *) echo "ERRO $var sem digest: $img" >&2; falhas=$((falhas + 1)) ;;
  esac
done < <(grep -E '^[A-Z_]+_IMAGE=' "$ARQUIVO")

[ "$total" -gt 0 ] || { echo "ERRO nenhuma imagem encontrada em $ARQUIVO" >&2; exit 1; }
[ "$falhas" -eq 0 ]
