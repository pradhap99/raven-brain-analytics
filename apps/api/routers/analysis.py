"""
POST /v1/analysis/jobs            — create a new analysis job
GET  /v1/analysis/jobs/{job_id}   — poll job status
GET  /v1/analysis/jobs/{job_id}/result — fetch full result
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException

from packages.types import CreateJobRequest, JobResponse, AnalysisResult
from ..db import jobs as job_store
from ..services import queue as job_queue
from ..config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Import the correct processor (mock or real)
# ---------------------------------------------------------------------------
if settings.mock_inference:
    from workers.inference.mock_runner import process_job
else:
    from workers.inference.runner import process_job  # type: ignore


async def _run_job(job_id: str) -> None:
    """Background coroutine: update status → run inference → store result."""
    job_store.update_job_status(job_id, "processing")
    try:
        raw = job_store.get_raw(job_id)
        result = await process_job(
            job_id=job_id,
            object_key=raw["object_key"],
            filename=raw["filename"],
            size_bytes=raw["size_bytes"],
            sections_config=raw.get("sections_config"),
        )
        job_store.set_job_result(job_id, result.model_dump())
        logger.info("Job %s completed", job_id)
    except Exception as exc:
        logger.exception("Job %s failed", job_id)
        job_store.update_job_status(job_id, "failed", error=str(exc))


@router.post("/jobs", response_model=JobResponse, status_code=202)
async def create_job(body: CreateJobRequest, background_tasks: BackgroundTasks) -> JobResponse:
    """Create an analysis job and enqueue it for processing."""
    response = job_store.create_job(
        object_key=body.object_key,
        filename=body.filename,
        size_bytes=body.size_bytes,
        sections_config=body.sections_config,
    )
    background_tasks.add_task(_run_job, response.job_id)
    return response


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str) -> JobResponse:
    """Poll status of an analysis job."""
    response = job_store.get_job(job_id)
    if not response:
        raise HTTPException(status_code=404, detail="Job not found")
    return response


@router.get("/jobs/{job_id}/result", response_model=AnalysisResult)
async def get_result(job_id: str) -> AnalysisResult:
    """Return the full analysis result once the job is completed."""
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "completed":
        raise HTTPException(status_code=409, detail=f"Job is not completed (status: {job.status})")
    result = job_store.get_job_result(job_id)
    if not result:
        raise HTTPException(status_code=500, detail="Result missing for completed job")
    return AnalysisResult(**result)
