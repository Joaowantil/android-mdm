from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db, async_session
from app.api.routes import auth, devices, policies, users, groups, audit
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


@app.middleware("http")
async def security_headers(request, call_next):
    # Basic browser-level hardening, cheap to add and normally expected of a
    # corporate web app. X-Frame-Options stops the panel being embedded in a
    # hidden <iframe> on another site (clickjacking); X-Content-Type-Options
    # stops the browser from guessing content types in a way that can enable
    # some XSS vectors; Referrer-Policy avoids leaking full URLs (which can
    # contain tokens in query strings) to third-party sites via the Referer
    # header. HSTS is included for when this moves to HTTPS - it's a no-op
    # over plain HTTP, browsers only honor it on secure responses.
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Routes
app.include_router(auth.router, prefix="/api")
app.include_router(devices.router, prefix="/api")
app.include_router(policies.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(groups.router, prefix="/api")
app.include_router(audit.router, prefix="/api")


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
