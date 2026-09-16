from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db, async_session
from app.api.routes import auth, devices, policies, users, groups
from app.services.seed import seed_admin

logger = logging.getLogger("app.startup")

_DEFAULT_SECRET_KEY = "change-this-secret-key-in-production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    if settings.SECRET_KEY == _DEFAULT_SECRET_KEY:
        # Anyone who knows this well-known default (it's public - it's the literal
        # default in this repo) can forge a valid admin JWT and log in as anyone,
        # with no password needed. This can't safely auto-fix itself (rotating the
        # key would invalidate every session on every restart), so it just refuses
        # to stay quiet about it.
        logger.critical(
            "=" * 70 + "\n"
            "SECURITY WARNING: SECRET_KEY is still the default value.\n"
            "Anyone who knows this default can forge admin login tokens.\n"
            "Set a real SECRET_KEY in your .env file immediately, e.g.:\n"
            '  python3 -c "import secrets; print(secrets.token_urlsafe(64))"\n'
            "then add SECRET_KEY=<that value> to backend/.env and restart.\n" + "=" * 70
        )
    await init_db()
    async with async_session() as session:
        await seed_admin(session)
    yield
    # Shutdown


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    # /docs, /redoc and the raw OpenAPI schema hand an attacker a full map of every
    # endpoint and request shape for free. Fine for local development, not for
    # something reachable on a real network - only exposed when DEBUG is explicitly on.
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(auth.router, prefix="/api")
app.include_router(devices.router, prefix="/api")
app.include_router(policies.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(groups.router, prefix="/api")


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs" if settings.DEBUG else None,
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}
