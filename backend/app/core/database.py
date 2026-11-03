import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

logger = logging.getLogger("app.db")

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")
_engine_kwargs: dict = {"echo": settings.DEBUG}
if not _is_sqlite:
    # pre_ping drops connections the server closed (restart, idle timeout) instead of
    # failing the first request that tries to reuse one; recycle keeps them from living
    # past typical proxy/firewall idle limits.
    _engine_kwargs.update(pool_pre_ping=True, pool_size=10, max_overflow=10, pool_recycle=1800)

engine = create_async_engine(settings.DATABASE_URL, **_engine_kwargs)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        else:
            try:
                await session.commit()
            except Exception:
                # With this FastAPI version the commit runs after the response has
                # already gone out, so the client may have seen a success. Never let
                # that pass unrecorded.
                logger.exception("commit failed - the change was NOT saved")
                await session.rollback()
                raise
        finally:
            await session.close()


def _run_light_migrations(conn):
    """Add columns introduced after a table was first created.

    The project uses ``create_all`` (no Alembic), which never alters existing
    tables. This keeps already-deployed databases (SQLite or PostgreSQL) in sync
    without a reset. Fresh databases get every column from the models directly.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(conn)
    tables = inspector.get_table_names()
    if "devices" in tables:
        columns = {c["name"] for c in inspector.get_columns("devices")}
        if "kiosk_web_links" not in columns:
            conn.execute(text("ALTER TABLE devices ADD COLUMN kiosk_web_links TEXT"))
        if "wifi_ssid" not in columns:
            conn.execute(text("ALTER TABLE devices ADD COLUMN wifi_ssid VARCHAR"))
        if "ip_address" not in columns:
            conn.execute(text("ALTER TABLE devices ADD COLUMN ip_address VARCHAR"))
        if "location_address" not in columns:
            conn.execute(text("ALTER TABLE devices ADD COLUMN location_address VARCHAR"))
        if "group_id" not in columns:
            conn.execute(text("ALTER TABLE devices ADD COLUMN group_id INTEGER"))
        if "kiosk_pin" not in columns:
            conn.execute(text("ALTER TABLE devices ADD COLUMN kiosk_pin VARCHAR"))
        if "device_secret" not in columns:
            conn.execute(text("ALTER TABLE devices ADD COLUMN device_secret VARCHAR"))
        if "notes" not in columns:
            conn.execute(text("ALTER TABLE devices ADD COLUMN notes TEXT"))
    if "policies" in tables:
        columns = {c["name"] for c in inspector.get_columns("policies")}
        if "kiosk_web_links" not in columns:
            conn.execute(text("ALTER TABLE policies ADD COLUMN kiosk_web_links TEXT"))
        if "kiosk_pin" not in columns:
            conn.execute(text("ALTER TABLE policies ADD COLUMN kiosk_pin VARCHAR"))


async def init_db(max_wait_seconds: int = 60):
    # In containers the API can start a moment before PostgreSQL accepts connections;
    # retry for a while instead of crashing on the first refusal.
    waited = 0
    while True:
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
                await conn.run_sync(_run_light_migrations)
            return
        except Exception as exc:
            if _is_sqlite or waited >= max_wait_seconds:
                raise
            logger.warning("database not ready (%s) - retrying in 2s", type(exc).__name__)
            await asyncio.sleep(2)
            waited += 2
