"""
Shared result schema for Raven Brain Analytics.
Used by both the FastAPI backend and inference worker.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class JobStatus(str, Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class CognitiveLoad(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


# ---------------------------------------------------------------------------
# Sub-models
# ---------------------------------------------------------------------------

class InputMetadata(BaseModel):
    filename: str
    size_bytes: int
    duration_seconds: Optional[float] = None
    fps: Optional[float] = None
    resolution: Optional[str] = None
    upload_url: Optional[str] = None


class SummaryMetrics(BaseModel):
    predicted_attention: float = Field(..., ge=0.0, le=1.0)
    peak_activation: float = Field(..., ge=0.0, le=1.0)
    peak_segment: int = Field(..., ge=0)
    cta_strength: float = Field(..., ge=0.0, le=1.0)
    cognitive_load: CognitiveLoad
    predicted_segments: int = Field(..., ge=1)


class SectionScore(BaseModel):
    name: str
    start_seconds: float
    end_seconds: Optional[float] = None
    score: float = Field(..., ge=0.0, le=1.0)
    rank: int


class TimelinePoint(BaseModel):
    segment_index: int
    second: float
    activation: float = Field(..., ge=0.0, le=1.0)


class Insight(BaseModel):
    type: str  # "primary" | "weakness" | "recommendation" | "general"
    text: str
    confidence: Optional[float] = None


class Artifact(BaseModel):
    name: str
    url: str
    mime_type: str


class ModelMetadata(BaseModel):
    model_name: str
    model_version: str
    inference_time_ms: Optional[float] = None
    device: Optional[str] = None


# ---------------------------------------------------------------------------
# Top-level result
# ---------------------------------------------------------------------------

class AnalysisResult(BaseModel):
    job_id: str
    status: JobStatus
    input: InputMetadata
    summary: SummaryMetrics
    sections: List[SectionScore]
    timeline: List[TimelinePoint]
    insights: List[Insight]
    artifacts: List[Artifact] = Field(default_factory=list)
    model_meta: ModelMetadata
    created_at: str
    completed_at: Optional[str] = None


# ---------------------------------------------------------------------------
# API request / response wrappers
# ---------------------------------------------------------------------------

class UploadSignRequest(BaseModel):
    filename: str
    content_type: str = "video/mp4"
    size_bytes: int


class UploadSignResponse(BaseModel):
    upload_url: str
    object_key: str
    expires_in: int = 900


class CreateJobRequest(BaseModel):
    object_key: str
    filename: str
    size_bytes: int
    sections_config: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional section time ranges, e.g. {hook:[0,3], intro:[3,6]}"
    )


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    created_at: str
    updated_at: str
    result_url: Optional[str] = None
    error: Optional[str] = None
