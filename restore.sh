#!/bin/sh
# Restaura um backup SUBSTITUINDO os dados atuais (pede confirmação).
#   sh scripts/restore.sh backups/mdm-AAAA-MM-DD_HHMM.dump
# É a importação com --force: veja scripts/importar-dump.sh (transação única; se falhar, nada muda).
set -eu
cd "$(dirname "$0")/.."
[ -n "${1:-}" ] || { echo "uso: sh scripts/restore.sh ARQUIVO.dump" >&2; exit 1; }
exec sh scripts/importar-dump.sh "$1" --force
