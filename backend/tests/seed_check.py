"""Testes do administrador inicial (seed). Rodam em SQLite temporário:

    python tests/seed_check.py
"""
import asyncio, os, sys, tempfile

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False); _tmp.close()
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_tmp.name}"
os.environ.setdefault("SECRET_KEY", "k" * 40)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, select  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import async_session, init_db  # noqa: E402
from app.core.security import get_password_hash, verify_password  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.seed import seed_admin  # noqa: E402

results = []
def check(name, ok):
    results.append(ok); print(("OK    " if ok else "FALHA ") + name)

async def users():
    async with async_session() as db:
        return {u.email: u for u in (await db.execute(select(User))).scalars().all()}

async def reset():
    async with async_session() as db:
        await db.execute(delete(User)); await db.commit()

async def run_seed():
    async with async_session() as db:
        await seed_admin(db)

async def main():
    await init_db()

    await reset(); settings.INITIAL_ADMIN_PASSWORD = ""
    await run_seed(); u = await users()
    check("banco vazio, sem variável: cria o admin com a senha padrão (e avisa no log)",
          "admin@mdm.local" in u and verify_password("admin123", u["admin@mdm.local"].hashed_password))

    await reset(); settings.INITIAL_ADMIN_PASSWORD = "Uma-Senha-Forte-77"
    await run_seed(); u = await users()
    check("banco vazio, com INITIAL_ADMIN_PASSWORD: usa a senha definida",
          verify_password("Uma-Senha-Forte-77", u["admin@mdm.local"].hashed_password))
    check("...e a senha pública 'admin123' NÃO funciona",
          not verify_password("admin123", u["admin@mdm.local"].hashed_password))

    await reset(); settings.INITIAL_ADMIN_PASSWORD = "curta"
    try:
        await run_seed(); check("senha inicial curta é recusada", False)
    except RuntimeError:
        check("senha inicial curta é recusada (a API não sobe com ela)", True)
    check("...e nenhum usuário foi criado", len(await users()) == 0)

    # o cenário que era o defeito: contas nominais existem, o admin padrão foi removido
    await reset(); settings.INITIAL_ADMIN_PASSWORD = ""
    async with async_session() as db:
        db.add(User(email="maria@empresa.com", hashed_password=get_password_hash("Senha-Forte-123"), role="admin", is_active=True))
        await db.commit()
    await run_seed()
    check("REINÍCIO sem o admin padrão: ele NÃO é recriado", "admin@mdm.local" not in await users())

    # restaurar backup que já tem o admin: não mexe na senha dele
    await reset()
    async with async_session() as db:
        db.add(User(email="admin@mdm.local", hashed_password=get_password_hash("Senha-Trocada-9"), role="admin", is_active=True))
        await db.commit()
    await run_seed(); u = await users()
    check("com o admin já existente: a senha dele não é alterada",
          verify_password("Senha-Trocada-9", u["admin@mdm.local"].hashed_password) and len(u) == 1)

    print(f"\n{sum(results)}/{len(results)} verificações passaram")
    return all(results)

ok = asyncio.run(main())
os.unlink(_tmp.name)
sys.exit(0 if ok else 1)
