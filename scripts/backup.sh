#!/bin/sh
# Backup do banco (PostgreSQL), com o sistema no ar.
#
#   sh scripts/backup.sh
#
# Grava em ./backups, confere que o arquivo é válido e apaga os com mais de RETENCAO_DIAS (30).
# Agendar (cron do servidor, todo dia às 2h):
#   0 2 * * * cd /CAMINHO/DO/PROJETO && sh scripts/backup.sh >> backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
umask 077     # o backup tem hashes de senha e segredos: só o dono lê

RETENCAO_DIAS="${RETENCAO_DIAS:-30}"
mkdir -p backups
OUT="backups/mdm-$(date +%Y-%m-%d_%H%M).dump"

if ! docker compose exec -T db pg_dump -U mdm -d mdm -Fc --no-owner --no-acl > "$OUT"; then
  rm -f "$OUT"; echo "ERRO: o backup falhou (o container db está no ar? docker compose ps)" >&2; exit 1
fi
[ -s "$OUT" ] || { rm -f "$OUT"; echo "ERRO: backup vazio" >&2; exit 1; }
# Um backup que nunca foi lido é só uma esperança: confere que o arquivo abre.
if ! docker compose exec -T db pg_restore -l < "$OUT" >/dev/null 2>&1; then
  mv "$OUT" "$OUT.INVALIDO"; echo "ERRO: o backup foi gerado mas NÃO é válido (renomeado para $OUT.INVALIDO)" >&2; exit 1
fi
( cd backups && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256" )
find backups -name 'mdm-*.dump' -mtime "+$RETENCAO_DIAS" -delete 2>/dev/null || true
find backups -name 'mdm-*.dump.sha256' -mtime "+$RETENCAO_DIAS" -delete 2>/dev/null || true
echo "$(date '+%Y-%m-%d %H:%M:%S') backup OK: $OUT ($(du -h "$OUT" | cut -f1))"
