#!/usr/bin/env python3
"""Avisa se alguma conta do painel ainda aceita uma senha pública/padrão.

Só LÊ o banco; nunca grava. Rode ANTES de migrar (no servidor atual) e DEPOIS de
restaurar (no novo):

  # servidor atual (com o venv do backend ativo e o .env na pasta backend)
  python scripts/checar_senhas_padrao.py

  # Docker
  docker compose exec backend python scripts/checar_senhas_padrao.py

Sai com código 1 se achar alguma conta com senha fraca (útil em automação).
Também lista contas administradoras ativas e se o admin padrão (admin@mdm.local) existe.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from app.core.database import async_session  # noqa: E402
from app.core.security import verify_password  # noqa: E402
from app.models.user import User  # noqa: E402

# Senhas que NUNCA devem valer. A lista é curta de propósito: serve para pegar o padrão
# público do projeto e os descuidos mais comuns, não é um auditor de senhas.
SENHAS_FRACAS = ["admin123", "admin", "password", "senha123", "12345678", "mudar123", "123456789"]


async def main() -> int:
    async with async_session() as db:
        usuarios = (await db.execute(select(User).order_by(User.id))).scalars().all()

    print(f"{len(usuarios)} usuário(s) no banco.\n")
    fracas = []
    for u in usuarios:
        for senha in SENHAS_FRACAS:
            if verify_password(senha, u.hashed_password):
                fracas.append((u, senha))
                break

    admins = [u for u in usuarios if u.role == "admin" and u.is_active]
    print("Administradores ativos:", ", ".join(u.email for u in admins) or "NENHUM")
    padrao = next((u for u in usuarios if u.email == "admin@mdm.local"), None)
    print("Admin padrão (admin@mdm.local):",
          "não existe" if padrao is None else ("existe e ESTÁ ATIVO" if padrao.is_active else "existe, desativado"))
    print()

    if not fracas:
        print("OK: nenhuma conta aceita uma das senhas fracas conhecidas.")
        return 0
    print("ATENÇÃO: contas com senha fraca/pública:")
    for u, senha in fracas:
        print(f"  - {u.email}  (papel: {u.role}, {'ativa' if u.is_active else 'desativada'})  -> aceita '{senha}'")
    print("\nTroque a senha (Usuários > chave) ou desative/exclua a conta ANTES de expor o sistema.")
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
