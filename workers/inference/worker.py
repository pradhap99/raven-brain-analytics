"""
Standalone async worker entrypoint.
Run with:  python -m workers.inference.worker
Polls Redis for job_ids and processes them independently of the API server.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys

# Ensure repo root is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from apps.api.config import settings
from apps.api.db import jobs as job_store

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

if settings.mock_inference:
    from workers.inference.mock_runner import process_job
else:
    from workers.inference.runner import process_job  # type: ignore


async def handle(job_id: str) -> None:
    logger.info("Processing job %s", job_id)
    job_store.update_job_status(job_id, "processing")
    try:
        raw = job_store.get_raw(job_id)
        if not raw:
            logger.error("Job %s not found in store", job_id)
            return
        result = await process_job(
            job_id=job_id,
            object_key=raw["object_key"],
            filename=raw["filename"],
            size_bytes=raw["size_bytes"],
            sections_config=raw.get("sections_config"),
        )
        job_store.set_job_result(job_id, result.model_dump())
        logger.info("Job %s completed", job_id)
    except Exception:
        logger.exception("Job %s failed", job_id)
        job_store.update_job_status(job_id, "failed")


async def poll_redis() -> None:
    import aioredis

    redis = aioredis.from_url(settings.redis_url)
    logger.info("Worker listening on Redis queue raven:jobs")
    while True:
        _, job_id_bytes = await redis.blpop("raven:jobs")
        job_id = job_id_bytes.decode()
        asyncio.create_task(handle(job_id))


async def main() -> None:
    if settings.queue_backend == "redis":
        await poll_redis()
    else:
        logger.info("No external queue configured; worker is idle (jobs handled in-process by API).")
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
