"""
In-memory job store (replace with a real DB in production).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Dict, Optional

from packages.types import JobResponse, JobStatus


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Simple dict-backed store — swap for SQLAlchemy / Redis in production
_jobs: Dict[str, dict] = {}


def create_job(object_key: str, filename: str, size_bytes: int, sections_config: Optional[dict] = None) -> JobResponse:
    job_id = str(uuid.uuid4())
    now = _now()
    record = {
        "job_id": job_id,
        "status": JobStatus.queued,
        "object_key": object_key,
        "filename": filename,
        "size_bytes": size_bytes,
        "sections_config": sections_config,
        "created_at": now,
        "updated_at": now,
        "result": None,
        "error": None,
    }
    _jobs[job_id] = record
    return _to_response(record)


def get_job(job_id: str) -> Optional[JobResponse]:
    record = _jobs.get(job_id)
    if not record:
        return None
    return _to_response(record)


def update_job_status(job_id: str, status: JobStatus, error: Optional[str] = None) -> Optional[JobResponse]:
    record = _jobs.get(job_id)
    if not record:
        return None
    record["status"] = status
    record["updated_at"] = _now()
    if error:
        record["error"] = error
    return _to_response(record)


def set_job_result(job_id: str, result: dict) -> Optional[JobResponse]:
    record = _jobs.get(job_id)
    if not record:
        return None
    record["result"] = result
    record["status"] = JobStatus.completed
    record["updated_at"] = _now()
    return _to_response(record)


def get_job_result(job_id: str) -> Optional[dict]:
    record = _jobs.get(job_id)
    if not record:
        return None
    return record.get("result")


def get_raw(job_id: str) -> Optional[dict]:
    return _jobs.get(job_id)


def _to_response(record: dict) -> JobResponse:
    return JobResponse(
        job_id=record["job_id"],
        status=record["status"],
        created_at=record["created_at"],
        updated_at=record["updated_at"],
        error=record.get("error"),
    )
