"""Minimal in-memory rate limiter.

No new dependency, no Redis - this is a single-process deployment (one uvicorn
worker), so a plain dict is enough to stop brute-force attempts against /auth/login.
If this ever runs with multiple workers/processes, this state wouldn't be shared
across them and would need to move to something like Redis instead.
"""
import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, status

_lock = Lock()
_failures: dict[str, list[float]] = defaultdict(list)

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 300  # 5 minutes


def check_rate_limit(key: str) -> None:
    """Raises 429 if `key` (e.g. "login:<ip>:<email>") has too many recent failures."""
    now = time.monotonic()
    with _lock:
        attempts = [t for t in _failures[key] if now - t < WINDOW_SECONDS]
        _failures[key] = attempts
        if len(attempts) >= MAX_ATTEMPTS:
            retry_after = int(WINDOW_SECONDS - (now - attempts[0]))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many attempts. Try again in {max(retry_after, 1)}s.",
                headers={"Retry-After": str(max(retry_after, 1))},
            )


def record_failure(key: str) -> None:
    with _lock:
        _failures[key].append(time.monotonic())


def reset(key: str) -> None:
    with _lock:
        _failures.pop(key, None)
