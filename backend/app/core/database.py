from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def _run_light_migrations(conn):
    """Add columns introduced after a table was first created.

    The project uses ``create_all`` (no Alembic), which never alters existing
    tables. This keeps already-deployed SQLite databases in sync without a reset.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(conn)
    if "devices" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("devices")}
    if "kiosk_web_links" not in columns:
        conn.execute(text("ALTER TABLE devices ADD COLUMN kiosk_web_links TEXT"))


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_run_light_migrations)
