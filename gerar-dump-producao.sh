#!/bin/sh
# Gera o dump do banco de PRODUÇÃO, para levar ao servidor novo.
#
# Rode no servidor ATUAL (onde o PostgreSQL está instalado direto na máquina), como root:
#
#   sh scripts/gerar-dump-producao.sh
#
# O arquivo contém HASHES DE SENHA e os SEGREDOS dos aparelhos: trate como credencial.
# Não envie por e-mail/chat, não coloque no Git, apague as cópias depois da migração.
#
# Variáveis opcionais:  DB=mdm   DEST_DIR=/var/backups/mdm
set -eu

DB="${DB:-mdm}"
DEST_DIR="${DEST_DIR:-/var/backups/mdm}"
STAMP="$(date +%Y-%m-%d_%H%M)"
OUT="$DEST_DIR/mdm-migracao-$STAMP.dump"

[ "$(id -u)" -eq 0 ] || { echo "ERRO: rode como root (o script age como o usuário postgres)." >&2; exit 1; }

# Roda um comando como o usuário postgres a partir de /tmp (a pasta de onde você chamou pode
# ser ilegível para ele, o que gera o aviso "could not change directory").
as_postgres() {
  cd /tmp
  if command -v runuser >/dev/null 2>&1; then runuser -u postgres -- "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo -u postgres "$@"
  else echo "ERRO: não há runuser nem sudo neste servidor." >&2; exit 1; fi
}

echo "1/5 Conferindo o banco '$DB'..."
as_postgres psql -d "$DB" -tAc "select 1" >/dev/null 2>&1 || { echo "ERRO: não consegui abrir o banco '$DB'." >&2; exit 1; }
echo "    versão do PostgreSQL deste servidor: $(as_postgres psql -d "$DB" -tAc 'show server_version')"
echo "    versão do pg_dump: $(as_postgres pg_dump --version)"

echo "2/5 O que será exportado (linhas por tabela):"
as_postgres psql -d "$DB" -tA -F '  ' <<'SQL' | sed 's/^/    /'
SELECT format('SELECT %L AS tabela, count(*) AS linhas FROM %I', tablename, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
\gexec
SQL

echo "3/5 Gerando o dump em $OUT ..."
mkdir -p "$DEST_DIR"; chmod 700 "$DEST_DIR"; chown postgres "$DEST_DIR" 2>/dev/null || true
# --no-owner/--no-acl: o dump não amarra os objetos ao usuário/permissões DESTE servidor.
as_postgres sh -c "pg_dump -Fc --no-owner --no-acl -d '$DB' > '$OUT'" || { rm -f "$OUT"; echo "ERRO: o pg_dump falhou." >&2; exit 1; }
[ -s "$OUT" ] || { rm -f "$OUT"; echo "ERRO: o dump saiu vazio." >&2; exit 1; }
chmod 600 "$OUT"

echo "4/5 Verificando o arquivo..."
TABELAS_DUMP="$(as_postgres pg_restore -l "$OUT" | grep -c ' TABLE DATA ' || true)"
TABELAS_BANCO="$(as_postgres psql -d "$DB" -tAc "select count(*) from pg_tables where schemaname='public'")"
as_postgres pg_restore -l "$OUT" >/dev/null || { echo "ERRO: o arquivo gerado não é um dump válido." >&2; exit 1; }
if [ "$TABELAS_DUMP" != "$TABELAS_BANCO" ]; then
  echo "ERRO: o dump tem $TABELAS_DUMP tabelas com dados, mas o banco tem $TABELAS_BANCO." >&2; exit 1
fi
echo "    válido: $TABELAS_DUMP tabelas com dados (o banco tem $TABELAS_BANCO)."
( cd "$DEST_DIR" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256" )

echo "5/5 Pronto."
echo
echo "    Arquivo : $OUT ($(du -h "$OUT" | cut -f1))"
echo "    SHA-256 : $(cut -d' ' -f1 "$OUT.sha256")"
echo
echo "Próximos passos:"
echo "  - Copie para o servidor novo por canal seguro, por exemplo:"
echo "      scp $OUT $OUT.sha256 USUARIO@SERVIDOR_NOVO:/caminho/do/projeto/migration/"
echo "  - No servidor novo, confira a integridade:   sha256sum -c $(basename "$OUT").sha256"
echo "  - Depois da migração, APAGUE as cópias deste arquivo (aqui e no servidor novo)."
echo
echo "Para uma virada sem perder dados, PARE a API antes de gerar o dump final:"
echo "      systemctl stop mdm-backend     (e gere o dump de novo)"
