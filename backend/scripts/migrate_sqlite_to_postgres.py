#!/usr/bin/env python3
"""Copia todos os dados de um banco SQLite do MDM para um PostgreSQL.

Uso (de dentro da pasta backend, com as dependências instaladas):

  python scripts/migrate_sqlite_to_postgres.py \
      --sqlite ./mdm.db \
      --postgres postgresql://mdm:SENHA@HOST:5432/mdm \
      [--dry-run] [--force]

  --dry-run  faz tudo e mostra o relatório, mas desfaz no final (nada é gravado)
  --force    esvazia as tabelas do destino antes de copiar (sem isso, o script
             se recusa a rodar se o PostgreSQL já tiver dados)

O que o script cuida:
  * cria as tabelas no PostgreSQL a partir dos modelos do projeto;
  * copia na ordem certa das chaves estrangeiras, tudo em UMA transação
    (se algo falhar, o destino fica como estava);
  * pula registros órfãos (ex.: comando de um aparelho que já foi apagado) - o
    SQLite aceitava isso, o PostgreSQL não - e informa quantos foram;
  * aceita SQLite antigo, sem colunas/tabelas que o código novo já tem;
  * converte datas para UTC com fuso;
  * reajusta as sequências de ID (senão o próximo cadastro colide com um ID já usado);
  * confere as contagens no fim e sai com erro se algo não bater.
"""
import argparse
import asyncio
import importlib
import os
import pkgutil
import sys
from datetime import timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import inspect, select, text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

import app.models as models_pkg  # noqa: E402

for _m in pkgutil.iter_modules(models_pkg.__path__):
    importlib.import_module(f"app.models.{_m.name}")
from app.core.database import Base  # noqa: E402

BATCH = 500


def pg_url(value: str) -> str:
    for prefix in ("postgres://", "postgresql://"):
        if value.startswith(prefix):
            return "postgresql+asyncpg://" + value[len(prefix):]
    return value


def masked(url: str) -> str:
    if "@" in url and "://" in url:
        scheme, rest = url.split("://", 1)
        return f"{scheme}://***@{rest.split('@', 1)[1]}"
    return url


async def run(args) -> int:
    if not os.path.exists(args.sqlite):
        print(f"ERRO: arquivo SQLite não encontrado: {args.sqlite}")
        return 2

    src = create_async_engine(f"sqlite+aiosqlite:///{os.path.abspath(args.sqlite)}")
    dst = create_async_engine(pg_url(args.postgres))
    tables = list(Base.metadata.sorted_tables)  # pais antes dos filhos

    print(f"Origem : {args.sqlite}")
    print(f"Destino: {masked(pg_url(args.postgres))}")
    print("Modo   :", "SIMULAÇÃO (nada será gravado)" if args.dry_run else "REAL")

    # esquema do destino (idempotente)
    async with dst.begin() as c:
        await c.run_sync(Base.metadata.create_all)

    referenced = {(fk.column.table.name, fk.column.name) for t in tables for fk in t.foreign_keys}
    report, ok = [], True
    async with src.connect() as sconn, dst.connect() as dconn:
        src_tables = await sconn.run_sync(lambda c: set(inspect(c).get_table_names()))
        trans = await dconn.begin()
        try:
            non_empty = []
            for t in tables:
                n = (await dconn.execute(text(f'SELECT COUNT(*) FROM "{t.name}"'))).scalar_one()
                if n:
                    non_empty.append(f"{t.name} ({n})")
            if non_empty and not args.force:
                print("\nERRO: o PostgreSQL de destino já tem dados em: " + ", ".join(non_empty))
                print("Use --force para esvaziar o destino antes de copiar.")
                await trans.rollback()
                return 3
            if non_empty:
                names = ", ".join(f'"{t.name}"' for t in tables)
                await dconn.execute(text(f"TRUNCATE TABLE {names} RESTART IDENTITY CASCADE"))
                print("Destino esvaziado (--force).")

            migrated_keys: dict[tuple[str, str], set] = {}
            for t in tables:
                if t.name not in src_tables:
                    report.append((t.name, 0, 0, 0, 0))
                    continue
                src_cols = await sconn.run_sync(
                    lambda c, n=t.name: {col["name"] for col in inspect(c).get_columns(n)}
                )
                cols = [c for c in t.columns if c.name in src_cols]
                rows = (await sconn.execute(select(*cols))).all()

                fks = [(fk.parent.name, fk.column.table.name, fk.column.name) for fk in t.foreign_keys]
                good, orphans = [], 0
                for r in rows:
                    d = dict(r._mapping)
                    for k, v in d.items():
                        if hasattr(v, "tzinfo") and v.tzinfo is None:
                            d[k] = v.replace(tzinfo=timezone.utc)  # SQLite guarda UTC sem fuso
                    if any(d.get(col) is not None and d[col] not in migrated_keys.get((pt, pc), set())
                           for col, pt, pc in fks):
                        orphans += 1
                        continue
                    good.append(d)

                for i in range(0, len(good), BATCH):
                    await dconn.execute(t.insert(), good[i:i + BATCH])

                # Guarda os valores das colunas que outras tabelas referenciam (ex.: devices.id),
                # para o filtro de órfãos das tabelas filhas.
                for tname, cname in referenced:
                    if tname == t.name:
                        migrated_keys[(tname, cname)] = {d[cname] for d in good}

                inserted = (await dconn.execute(text(f'SELECT COUNT(*) FROM "{t.name}"'))).scalar_one()
                report.append((t.name, len(rows), orphans, len(good), inserted))
                if inserted != len(good):
                    ok = False

            # reajustar sequências de ID
            for t in tables:
                pk = list(t.primary_key.columns)
                if len(pk) == 1 and pk[0].name == "id":
                    await dconn.execute(text(
                        f"SELECT setval(pg_get_serial_sequence('\"{t.name}\"', 'id'), "
                        f"COALESCE((SELECT MAX(id) FROM \"{t.name}\"), 1), "
                        f"(SELECT COUNT(*) > 0 FROM \"{t.name}\"))"
                    ))

            if args.dry_run or not ok:
                await trans.rollback()
            else:
                await trans.commit()
        except Exception:
            await trans.rollback()
            raise

    print(f"\n{'tabela':<20}{'origem':>8}{'órfãos':>8}{'copiar':>8}{'destino':>9}")
    for name, n_src, orph, good, ins in report:
        flag = "" if good == ins else "  <-- DIVERGE"
        print(f"{name:<20}{n_src:>8}{orph:>8}{good:>8}{ins:>9}{flag}")
    total_orph = sum(r[2] for r in report)
    if total_orph:
        print(f"\nAtenção: {total_orph} registro(s) órfão(s) foram ignorados (apontavam para algo que não existe mais).")
    if not ok:
        print("\nERRO: contagens divergentes - nada foi gravado.")
        return 1
    print("\n" + ("SIMULAÇÃO concluída - nada foi gravado." if args.dry_run else "Migração concluída com sucesso."))
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sqlite", required=True, help="caminho do arquivo mdm.db")
    ap.add_argument("--postgres", required=True, help="URL do PostgreSQL de destino")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    sys.exit(asyncio.run(run(ap.parse_args())))
