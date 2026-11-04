#!/bin/sh
# Resumo rápido do sistema: containers, saúde, dados e último backup.
#   sh scripts/status.sh
set -u
cd "$(dirname "$0")/.."
PORTA="$(grep -E '^HTTP_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"; PORTA="${PORTA:-80}"

echo "== Containers =="
docker compose ps
echo
echo "== Saúde (painel + API, via http://127.0.0.1:$PORTA/health) =="
if command -v curl >/dev/null 2>&1; then
  curl -fsS --max-time 5 "http://127.0.0.1:$PORTA/health" && echo || echo "SEM RESPOSTA"
else echo "(curl não instalado)"; fi
echo
echo "== Dados =="
docker compose exec -T db psql -U mdm -d mdm -tA -F '  ' -c "select 'usuários', count(*) from users union all select 'dispositivos', count(*) from devices union all select 'dispositivos online (heartbeat < 60 s)', count(*) from devices where last_seen > now() - interval '60 seconds'" 2>/dev/null || echo "(não foi possível consultar o banco)"
echo
echo "== Último backup =="
ULT="$(ls -1t backups/mdm-*.dump 2>/dev/null | head -1 || true)"
[ -n "$ULT" ] && echo "$ULT ($(du -h "$ULT" | cut -f1), $(date -r "$ULT" '+%Y-%m-%d %H:%M'))" || echo "NENHUM backup encontrado em ./backups"
