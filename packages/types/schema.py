"""
Shared result schema for Raven Brain Analytics.
Used by both the FastAPI backend and inference worker.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------
# Enums
# --------------------------------------------------------------------------

class JobStatus(str, Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class CognitiveLoad(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class EngagementZone(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"
    drop = "drop"


class EmotionLabel(str, Enum):
    excitement = "excitement"
    curiosity = "curiosity"
    surprise = "surprise"
    neutral = "neutral"
    boredom = "boredom"
    confusion = "confusion"


# --------------------------------------------------------------------------
# Sub-models
# --------------------------------------------------------------------------

class InputMetadata(BaseModel):
    filename: str
    size_bytes: int
    duration_seconds: Optional[float] = None
    fps: Optional[float] = None
    resolution: Optional[str] = None
    upload_url: Optional[str] = None


class BrainRegionActivation(BaseModel):
    nacc: float = Field(..., ge=0.0, le=1.0, description="Nucleus Accumbens - reward/anticipation")
    mpfc: float = Field(..., ge=0.0, le=1.0, description="Medial Prefrontal Cortex - valuation")
    ains: float = Field(..., ge=0.0, le=1.0, description="Anterior Insula - emotional salience")
    visual_cortex: float = Field(..., ge=0.0, le=1.0, description="Visual cortex intensity")
    amygdala: float = Field(..., ge=0.0, le=1.0, description="Amygdala - emotional response")


class EmotionalArc(BaseModel):
    second: float
    valence: float = Field(..., ge=-1.0, le=1.0)
    arousal: float = Field(..., ge=0.0, le=1.0)
    dominant_emotion: EmotionLabel


class RetentionPoint(BaseModel):
    second: float
    retention_pct: float = Field(..., ge=0.0, le=100.0)


class EngagementZoneMarker(BaseModel):
    start_seconds: float
    end_seconds: float
    zone: EngagementZone
    label: str
    score: float = Field(..., ge=0.0, le=1.0)


class PacingMetrics(BaseModel):
    avg_scene_duration: float
    scene_count: int
    visual_change_rate: float
    pacing_score: float = Field(..., ge=0.0, le=1.0)
    rhythm_consistency: float = Field(..., ge=0.0, le=1.0)


class BenchmarkComparison(BaseModel):
    category: str
    percentile: int = Field(..., ge=0, le=100)
    avg_attention_in_category: float
    your_attention: float
    top_10_pct_threshold: float
    sample_size: int


class HookAnalysis(BaseModel):
    scroll_stop_probability: float = Field(..., ge=0.0, le=1.0)
    hook_strength: float = Field(..., ge=0.0, le=1.0)
    time_to_peak_ms: int
    first_frame_score: float = Field(..., ge=0.0, le=1.0)
    recommendation: str


class SummaryMetrics(BaseModel):
    predicted_attention: float = Field(..., ge=0.0, le=1.0)
    peak_activation: float = Field(..., ge=0.0, le=1.0)
    peak_segment: int = Field(..., ge=0)
    cta_strength: float = Field(..., ge=0.0, le=1.0)
    cognitive_load: CognitiveLoad
    predicted_segments: int = Field(..., ge=1)
    avg_valence: float = Field(0.0, ge=-1.0, le=1.0)
    avg_arousal: float = Field(0.0, ge=0.0, le=1.0)
    predicted_retention_pct: float = Field(0.0, ge=0.0, le=100.0)
    virality_score: float = Field(0.0, ge=0.0, le=1.0)
    overall_grade: str = Field("B")


class SectionScore(BaseModel):
    name: str
    start_seconds: float
    end_seconds: Optional[float] = None
    score: float
    rank: int


class TimelinePoint(BaseModel):
    segment_index: int
    second: float
    activation: float
    brain_regions: Optional[BrainRegionActivation] = None


class Insight(BaseModel):
    type: str
    text: str
    confidence: Optional[float] = None
    icon: Optional[str] = None


class Artifact(BaseModel):
    name: str
    url: str
    mime_type: str


class ModelMetadata(BaseModel):
    model_name: str
    model_version: str
    inference_time_ms: Optional[float] = None
    device: Optional[str] = None


class AnalysisResult(BaseModel):
    job_id: str
    status: JobStatus
    input: InputMetadata
    summary: SummaryMetrics
    sections: List[SectionScore]
    timeline: List[TimelinePoint]
    insights: List[Insight]
    artifacts: List[Artifact]
    model_meta: ModelMetadata
    created_at: str
    completed_at: Optional[str] = None
    brain_regions_summary: Optional[BrainRegionActivation] = None
    emotional_arc: Optional[List[EmotionalArc]] = None
    retention_curve: Optional[List[RetentionPoint]] = None
    engagement_zones: Optional[List[EngagementZoneMarker]] = None
    pacing: Optional[PacingMetrics] = None
    benchmark: Optional[BenchmarkComparison] = None
    hook_analysis: Optional[HookAnalysis] = None


# --------------------------------------------------------------------------
# Request / Response for API
# --------------------------------------------------------------------------

class CreateJobRequest(BaseModel):
    object_key: str
    filename: str
    size_bytes: int
    sections_config: Optional[Dict[str, Any]] = None


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    created_at: str
    updated_at: str
    result_url: Optional[str] = None
    error: Optional[str] = None


class UploadSignResponse(BaseModel):
    upload_url: str
    object_key: str
    expires_in: int
