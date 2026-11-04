#!/bin/sh
# Importa um dump (gerado por pg_dump -Fc) no banco do Docker.
#
#   sh scripts/importar-dump.sh migration/mdm-migracao-AAAA-MM-DD_HHMM.dump
#   sh scripts/importar-dump.sh arquivo.dump --force      # SUBSTITUI um banco que já tem dados
#
# Pensado para a PRIMEIRA instalação: o banco ainda vazio. A restauração é uma transação única:
# se QUALQUER passo falhar, nada fica gravado pela metade.
set -eu
cd "$(dirname "$0")/.."

ARQ="${1:-}"
FORCE=0
[ "${2:-}" = "--force" ] && FORCE=1
dc() { docker compose "$@"; }

[ -n "$ARQ" ] && [ -f "$ARQ" ] || { echo "uso: sh scripts/importar-dump.sh ARQUIVO.dump [--force]" >&2; exit 1; }
[ -f .env ] || { echo "ERRO: não existe o arquivo .env. Rode: cp .env.example .env  (e preencha)" >&2; exit 1; }

# Integridade, se o arquivo .sha256 estiver ao lado.
if [ -f "$ARQ.sha256" ]; then
  ( cd "$(dirname "$ARQ")" && sha256sum -c "$(basename "$ARQ").sha256" >/dev/null ) \
    || { echo "ERRO: o SHA-256 do arquivo não confere: ele foi corrompido ou alterado na cópia." >&2; exit 1; }
  echo "    SHA-256 confere."
fi

echo "1/6 Subindo só o banco..."
dc up -d db
i=0
until dc exec -T db pg_isready -h 127.0.0.1 -U mdm -d mdm -q 2>/dev/null; do
  i=$((i + 1)); [ "$i" -le 45 ] || { echo "ERRO: o banco não ficou pronto em 90 s. Veja: docker compose logs db" >&2; exit 1; }
  sleep 2
done

echo "2/6 Validando o arquivo (nada é alterado ainda)..."
dc exec -T db pg_restore -l < "$ARQ" >/dev/null 2>&1 \
  || { echo "ERRO: o arquivo não é um dump válido (formato custom do pg_dump -Fc) ou está incompleto." >&2; exit 1; }
echo "    $(dc exec -T db pg_restore -l < "$ARQ" | grep -c ' TABLE DATA ') tabelas com dados no arquivo."

echo "3/6 Conferindo o banco de destino..."
N="$(dc exec -T db psql -U mdm -d mdm -tA -c "select count(*) from information_schema.tables where table_schema='public'" | tr -d '[:space:]')"
CLEAN=""
STOPPED=0
if [ "$N" != "0" ]; then
  echo "    O banco de destino JÁ TEM $N tabela(s):"
  dc exec -T db psql -U mdm -d mdm -tA <<'SQL' | sed 's/^/      /'
SELECT format('SELECT %L AS tabela, count(*) AS linhas FROM %I', tablename, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
\gexec
SQL
  if [ "$FORCE" -ne 1 ]; then
    echo >&2
    echo "RECUSADO: importar por cima destruiria esses dados." >&2
    echo "Se isso é só o esquema vazio criado quando a API subiu pela primeira vez (todas as linhas acima em 0)," >&2
    echo "ou se você QUER substituir tudo, rode de novo com --force." >&2
    exit 2
  fi
  printf '    --force: isto APAGA os dados acima e restaura "%s".\n    Digite SIM para continuar: ' "$ARQ"
  read -r RESP
  [ "$RESP" = "SIM" ] || { echo "Cancelado. Nada foi alterado."; exit 1; }
  dc stop web backend >/dev/null 2>&1 || true
  STOPPED=1
  CLEAN="--clean --if-exists"
fi

echo "4/6 Restaurando (transação única)..."
# shellcheck disable=SC2086
if ! dc exec -T db pg_restore -U mdm -d mdm --no-owner --no-acl --single-transaction --exit-on-error $CLEAN < "$ARQ"; then
  echo >&2
  echo "ERRO: a restauração falhou. Como é uma transação única, NADA foi alterado no banco." >&2
  [ "$STOPPED" -eq 1 ] && dc start backend web >/dev/null 2>&1 || true
  exit 3
fi

echo "5/6 Verificando o resultado..."
dc exec -T db psql -U mdm -d mdm -tA <<'SQL' | sed 's/^/      /'
SELECT format('SELECT %L AS tabela, count(*) AS linhas FROM %I', tablename, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
\gexec
SQL
# Todo contador de id (sequência) precisa estar à frente do maior id existente, senão o próximo
# cadastro colidiria com um registro já existente.
dc exec -T db psql -U mdm -d mdm -v ON_ERROR_STOP=1 -q <<'SQL' \
  || { echo "ERRO: uma sequência de id ficou atrás dos dados. NÃO coloque em produção." >&2; exit 4; }
DO $$
DECLARE r record; mx bigint; lv bigint;
BEGIN
  FOR r IN SELECT c.relname AS tbl, pg_get_serial_sequence(format('public.%I', c.relname), 'id') AS seq
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r' LOOP
    CONTINUE WHEN r.seq IS NULL;
    EXECUTE format('SELECT COALESCE(max(id), 0) FROM public.%I', r.tbl) INTO mx;
    EXECUTE format('SELECT last_value FROM %s', r.seq) INTO lv;
    IF lv < mx THEN
      RAISE EXCEPTION 'sequência % atrás do maior id de % (% < %)', r.seq, r.tbl, lv, mx;
    END IF;
  END LOOP;
END $$;
SQL
echo "      sequências de id: OK"
USUARIOS="$(dc exec -T db psql -U mdm -d mdm -tA -c "select count(*) from users" 2>/dev/null | tr -d '[:space:]' || echo 0)"
[ "${USUARIOS:-0}" -gt 0 ] || echo "    ATENÇÃO: a tabela de usuários está vazia: ninguém conseguirá entrar (a API criaria um admin inicial)."

echo "6/6 Subindo a API e o painel..."
dc up -d
echo
echo "Importação concluída. Confira com:   sh scripts/status.sh"
echo "E verifique as senhas:   docker compose exec backend python scripts/checar_senhas_padrao.py"
