"""
Queue abstraction — in-memory (default), Redis, or SQS.
The inference worker is triggered by enqueuing a job_id.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Callable, Coroutine

from ..config import settings

logger = logging.getLogger(__name__)

# In-memory queue for local dev
_queue: asyncio.Queue = asyncio.Queue()
_processor: Callable[[str], Coroutine] | None = None


async def enqueue(job_id: str) -> None:
    if settings.queue_backend == "redis":
        import aioredis
        redis = aioredis.from_url(settings.redis_url)
        await redis.rpush("raven:jobs", job_id)
        logger.info("Enqueued job %s to Redis", job_id)
    else:
        await _queue.put(job_id)
        logger.info("Enqueued job %s to in-memory queue", job_id)


def register_processor(fn: Callable[[str], Coroutine]) -> None:
    """Register the async function that processes a job_id."""
    global _processor
    _processor = fn


async def start_worker() -> None:
    """Drain the in-memory queue (used in local dev)."""
    logger.info("In-memory queue worker started")
    while True:
        job_id = await _queue.get()
        if _processor:
            try:
                await _processor(job_id)
            except Exception:
                logger.exception("Error processing job %s", job_id)
        _queue.task_done()
