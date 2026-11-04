import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import get_password_hash
from app.models.user import User

logger = logging.getLogger("uvicorn.error")

DEFAULT_ADMIN_EMAIL = "admin@mdm.local"
DEFAULT_ADMIN_PASSWORD = "admin123"  # público: só vale como último recurso, com aviso no log
MIN_PASSWORD_LENGTH = 8  # mesma regra do cadastro de usuários


async def seed_admin(db: AsyncSession):
    """Cria o administrador inicial SOMENTE se não existir nenhum usuário.

    Antes, criava admin@mdm.local / admin123 sempre que ESSE e-mail não existia. Resultado:
    quem removia ou renomeava a conta padrão (a prática correta) a via ressuscitar, como
    administrador e com senha pública, a cada reinício da API, e também ao restaurar um
    backup em que ela já tinha sido removida.

    A senha inicial vem de INITIAL_ADMIN_PASSWORD. Sem ela, usa o padrão público e avisa.
    """
    total = (await db.execute(select(func.count(User.id)))).scalar_one()
    if total > 0:
        return

    password = settings.INITIAL_ADMIN_PASSWORD
    if password:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise RuntimeError(
                f"INITIAL_ADMIN_PASSWORD precisa ter pelo menos {MIN_PASSWORD_LENGTH} caracteres."
            )
    else:
        password = DEFAULT_ADMIN_PASSWORD
        logger.warning(
            "Banco vazio: criando %s com a senha PADRÃO '%s' (pública). Defina "
            "INITIAL_ADMIN_PASSWORD, ou troque a senha agora, no primeiro acesso.",
            DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD,
        )

    db.add(
        User(
            email=DEFAULT_ADMIN_EMAIL,
            hashed_password=get_password_hash(password),
            full_name="Administrador",
            role="admin",
            is_active=True,
        )
    )
    await db.commit()
    logger.info("Administrador inicial %s criado.", DEFAULT_ADMIN_EMAIL)
