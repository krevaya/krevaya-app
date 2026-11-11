"""Fixed-window rate limits, in memory or in Redis when REDIS_URL is set.

Limits are written like "10/minute". In-memory counters are per process, which is
fine for a single API container; run Redis if you scale out.
"""

import time
from collections import defaultdict

from fastapi import HTTPException, Request

from .config import get_settings

_WINDOWS = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}
_counts: dict[str, int] = defaultdict(int)
_redis = None


def parse(rule: str) -> tuple[int, int]:
    count, _, unit = rule.partition("/")
    return int(count), _WINDOWS[unit.strip().rstrip("s")]


def _client():
    global _redis
    url = get_settings().redis_url
    if not url:
        return None
    if _redis is None:
        import redis.asyncio as redis  # optional dependency

        _redis = redis.from_url(url)
    return _redis


async def hit(bucket: str, rule: str, cost: int = 1) -> bool:
    limit, window = parse(rule)
    slot = int(time.time() // window)
    key = f"rl:{bucket}:{slot}"
    client = _client()
    if client is not None:
        n = await client.incrby(key, cost)
        if n == cost:
            await client.expire(key, window + 1)
    else:
        _counts[key] += cost
        n = _counts[key]
        if len(_counts) > 50_000:
            _counts.clear()
    return n <= limit


def client_ip(request: Request) -> str:
    # uvicorn --proxy-headers already puts the forwarded address here. Reading
    # X-Forwarded-For ourselves would let anyone pick a fresh "IP" per request.
    return request.client.host if request.client else "?"


async def enforce(bucket: str, rule: str, cost: int = 1) -> None:
    if not await hit(bucket, rule, cost):
        raise HTTPException(429, "Too many requests. Try again in a minute.")
