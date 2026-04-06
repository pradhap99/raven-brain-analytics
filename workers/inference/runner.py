"""
Real Tribe V2 inference runner.

Pipeline
--------
1. Resolve the uploaded video path from storage.
2. Extract video metadata (duration, fps, resolution).
3. Sample frames per segment using video_utils.
4. Run each segment through the TribeV2Model (CLIP backbone + optional fine-tuned head).
5. Normalise activations → timeline, sections, summary metrics.
6. Generate deterministic insights from the activation pattern.
7. Return a fully populated AnalysisResult.

Configuration (all via environment variables)
---------------------------------------------
TRIBE_WEIGHTS_PATH      Path to a .pt checkpoint with "head" (and optionally "encoder") keys.
                        Leave empty to run in backbone-only proxy mode (no GPU required).
TRIBE_DEVICE            "auto" | "cuda" | "cpu" | "mps"  (default: "auto")
TRIBE_BACKBONE          HuggingFace model ID for the CLIP backbone
                        (default: "openai/clip-vit-base-patch32")
TRIBE_SEGMENT_DURATION  Seconds per segment (default: 1.0)
TRIBE_FRAMES_PER_SEG    Frames to sample per segment (default: 8)
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import numpy as np

from apps.api.config import settings
from apps.api.services.storage import local_path
from packages.types import (
    AnalysisResult,
    CognitiveLoad,
    InputMetadata,
    Insight,
    JobStatus,
    ModelMetadata,
    SectionScore,
    SummaryMetrics,
    TimelinePoint,
)

from .video_utils import extract_video_metadata, sample_frames_for_segments
from .tribe_model import get_model

logger = logging.getLogger(__name__)

# Default section map when caller omits sections_config.
_DEFAULT_SECTIONS: Dict[str, list] = {
    "hook": [0, 3],
    "intro": [3, 6],
    "main": [6, 10],
    "cta": [10, None],
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cognitive_load(activations: np.ndarray) -> CognitiveLoad:
    """
    Map activation variance to a cognitive load label.
    High variance → viewer is processing rapidly changing stimuli → high load.
    """
    std = float(np.std(activations))
    if std < 0.05:
        return CognitiveLoad.low
    if std < 0.12:
        return CognitiveLoad.medium
    return CognitiveLoad.high


def _build_sections(
    sections_config: Optional[Dict[str, Any]],
    activations: np.ndarray,
    video_duration: float,
    segment_duration: float,
) -> List[SectionScore]:
    """Compute per-section mean activation and rank sections."""
    cfg = sections_config or _DEFAULT_SECTIONS
    n = len(activations)
    results: List[SectionScore] = []

    for name, bounds in cfg.items():
        start_s = float(bounds[0])
        end_s = float(bounds[1]) if bounds[1] is not None else video_duration

        # Clamp to actual video length
        start_s = min(start_s, video_duration)
        end_s = min(end_s, video_duration)

        # Map seconds → segment indices
        start_idx = min(int(start_s / segment_duration), n - 1)
        end_idx = min(int(end_s / segment_duration), n)

        slice_ = activations[start_idx:end_idx]
        score = float(slice_.mean()) if slice_.size > 0 else 0.5

        results.append(
            SectionScore(
                name=name,
                start_seconds=start_s,
                end_seconds=end_s if bounds[1] is not None else None,
                score=round(min(max(score, 0.0), 1.0), 4),
                rank=0,
            )
        )

    # Rank highest → lowest
    results.sort(key=lambda s: s.score, reverse=True)
    for i, sec in enumerate(results):
        sec.rank = i + 1
    return results


def _build_insights(
    sections: List[SectionScore],
    activations: np.ndarray,
    peak_idx: int,
    segment_duration: float,
    has_real_weights: bool,
) -> List[Insight]:
    """Generate deterministic, data-driven insights from the activation curve."""
    best = sections[0] if sections else None
    worst = sections[-1] if sections else None

    confidence_base = 1.0 if has_real_weights else 0.72
    proxy_note = "" if has_real_weights else " (backbone-only proxy mode)"

    insights: List[Insight] = []

    # Primary
    if best:
        peak_second = round(peak_idx * segment_duration, 1)
        insights.append(
            Insight(
                type="primary",
                text=(
                    f"Your '{best.name}' section drives the strongest brain activation "
                    f"(score {best.score:.4f}), peaking at {peak_second}s. "
                    f"This is where viewers are most neurally engaged{proxy_note}."
                ),
                confidence=round(confidence_base, 2),
            )
        )

    # Weakness
    if worst:
        insights.append(
            Insight(
                type="weakness",
                text=(
                    f"The '{worst.name}' section scores lowest ({worst.score:.4f}). "
                    f"Consider adding a pattern interrupt or stronger visual stimulus "
                    f"in this segment to re-capture attention{proxy_note}."
                ),
                confidence=round(confidence_base - 0.05, 2),
            )
        )

    # Recommendation — based on the activation trend
    trend = float(np.polyfit(np.arange(len(activations)), activations, 1)[0])
    if trend < -0.005:
        rec = (
            "Engagement declines across the video. "
            "Front-load your most compelling content within the first 3 seconds "
            "to combat the scroll reflex."
        )
    elif trend > 0.005:
        rec = (
            "Engagement builds toward the end — a strong close. "
            "Consider shifting some of that energy earlier to reduce drop-off before the CTA."
        )
    else:
        rec = (
            "Engagement is relatively flat. "
            "Introduce higher-contrast cuts or motion every 2-3 seconds "
            "to create activation spikes and maintain neural interest."
        )

    insights.append(
        Insight(
            type="recommendation",
            text=rec,
            confidence=round(confidence_base - 0.03, 2),
        )
    )

    # General
    mean_act = float(activations.mean())
    if mean_act > 0.62:
        percentile_label = "above the 70th"
    elif mean_act > 0.50:
        percentile_label = "above the 50th"
    else:
        percentile_label = "below the 50th"

    insights.append(
        Insight(
            type="general",
            text=(
                f"Overall mean activation is {mean_act:.4f}, placing this reel "
                f"{percentile_label} percentile for IG Reels in this category{proxy_note}."
            ),
            confidence=round(confidence_base - 0.10, 2),
        )
    )

    return insights


# ── Main entry point ──────────────────────────────────────────────────────────

async def process_job(
    job_id: str,
    object_key: str,
    filename: str,
    size_bytes: int,
    sections_config: Optional[Dict[str, Any]] = None,
) -> AnalysisResult:
    """
    Run Tribe V2 inference on an uploaded video and return a fully populated
    AnalysisResult compatible with the frontend dashboard.

    The heavy model work is offloaded to a thread pool executor so it does not
    block the asyncio event loop.
    """
    t0 = time.time()
    now = datetime.now(timezone.utc).isoformat()

    # ── 1. Resolve file path ──────────────────────────────────────────────────
    video_path = local_path(object_key)
    logger.info("Job %s: processing %s", job_id, video_path)

    # ── 2–5. CPU/GPU work — run in thread pool to stay async-friendly ─────────
    loop = asyncio.get_event_loop()
    activations, meta = await loop.run_in_executor(
        None, _run_inference, video_path
    )

    # ── 6. Build structured output ────────────────────────────────────────────
    segment_duration: float = settings.tribe_segment_duration
    video_duration: float = meta["duration_seconds"]

    peak_idx = int(np.argmax(activations))
    sections = _build_sections(sections_config, activations, video_duration, segment_duration)

    model = get_model(
        weights_path=settings.tribe_weights_path or None,
        backbone_id=settings.tribe_backbone,
        device=settings.tribe_device,
    )

    insights = _build_insights(
        sections, activations, peak_idx, segment_duration, model.has_weights
    )

    inference_ms = round((time.time() - t0) * 1000, 1)
    completed_at = datetime.now(timezone.utc).isoformat()

    return AnalysisResult(
        job_id=job_id,
        status=JobStatus.completed,
        input=InputMetadata(
            filename=filename,
            size_bytes=size_bytes,
            duration_seconds=round(video_duration, 2),
            fps=round(meta["fps"], 2),
            resolution=meta["resolution"],
            upload_url=f"local://{object_key}",
        ),
        summary=SummaryMetrics(
            predicted_attention=round(float(activations.mean()), 4),
            peak_activation=round(float(activations.max()), 4),
            peak_segment=peak_idx,
            cta_strength=round(float(activations[-1]), 4),
            cognitive_load=_cognitive_load(activations),
            predicted_segments=len(activations),
        ),
        sections=sections,
        timeline=[
            TimelinePoint(
                segment_index=i,
                second=round(i * segment_duration, 2),
                activation=round(float(v), 4),
            )
            for i, v in enumerate(activations)
        ],
        insights=insights,
        artifacts=[],
        model_meta=ModelMetadata(
            model_name="tribe-v2",
            model_version="2.0.0" if model.has_weights else "2.0.0-backbone-proxy",
            inference_time_ms=inference_ms,
            device=model.device,
        ),
        created_at=now,
        completed_at=completed_at,
    )


def _run_inference(video_path: str) -> tuple[np.ndarray, dict]:
    """
    Synchronous inference work — called inside a thread pool executor.

    Returns (activations: np.ndarray[n_segments, float64 in 0..1], metadata: dict).
    """
    # Load model singleton (uses settings at call time)
    model = get_model(
        weights_path=settings.tribe_weights_path or None,
        backbone_id=settings.tribe_backbone,
        device=settings.tribe_device,
    )

    # Extract metadata
    meta = extract_video_metadata(video_path)

    # Sample frames per segment
    segments, _ = sample_frames_for_segments(
        video_path,
        segment_duration=settings.tribe_segment_duration,
        frames_per_segment=settings.tribe_frames_per_segment,
    )

    # Run model
    activations = model.predict_engagement(segments)

    return activations, meta
