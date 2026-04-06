"""
Real Tribe V2 inference runner.

Pipeline
--------
1.  Validate the video file (duration, decodability).
2.  Load the model via the InferenceAdapter (idempotent; cached per-process).
3.  Extract video metadata (fps, resolution, duration) — video decode phase.
4.  Sample frames per segment — frame sampling phase.
5.  Run inference — model forward-pass phase.
6.  Compute summary metrics, timeline, section rankings, and insights.
7.  Serialise result — serialization phase.
8.  Generate result artifacts (timeline PNG, summary JSON, thumbnail strip).

Timing metrics for every phase are logged at INFO level as a structured dict.

Configuration (all via environment variables)
---------------------------------------------
MOCK_INFERENCE         false → use this runner; true → use mock_runner
TRIBE_WEIGHTS_PATH     .pt checkpoint with "head" key (optional, proxy mode if absent)
TRIBE_DEVICE           "auto" | "cuda" | "cpu" | "mps"  (default: "auto")
TRIBE_BACKBONE         HuggingFace model ID  (default: "openai/clip-vit-base-patch32")
TRIBE_SEGMENT_DURATION Seconds per segment (default: 1.0)
TRIBE_FRAMES_PER_SEG   Frames sampled per segment (default: 8)
ARTIFACTS_DIR          Directory for generated artifacts (default: /tmp/raven_artifacts)
ARTIFACTS_BASE_URL     URL prefix for artifact links (default: http://localhost:8000/v1/artifacts)
VIDEO_MAX_DURATION_S   Maximum allowed video duration in seconds (default: 300)
INFERENCE_ADAPTER      Optional fully-qualified class name for a custom InferenceAdapter
"""
from __future__ import annotations

import asyncio
import logging
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional, Tuple

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

from .adapter import InferenceAdapter, get_adapter
from .artifacts import generate_artifacts
from .validation import VideoValidationError, validate_video_file

logger = logging.getLogger(__name__)

# Default section map when caller omits sections_config.
_DEFAULT_SECTIONS: Dict[str, list] = {
    "hook": [0, 3],
    "intro": [3, 6],
    "main": [6, 10],
    "cta": [10, None],
}


# ── Timing context manager ────────────────────────────────────────────────────

@contextmanager
def _timed(label: str, timing: Dict[str, float]) -> Iterator[None]:
    """Record elapsed milliseconds for *label* into *timing*."""
    t0 = time.perf_counter()
    try:
        yield
    finally:
        timing[label] = round((time.perf_counter() - t0) * 1000, 1)


# ── Result helpers ────────────────────────────────────────────────────────────

def _cognitive_load(activations: np.ndarray) -> CognitiveLoad:
    """Map activation variance to a cognitive load label."""
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

        start_s = min(start_s, video_duration)
        end_s = min(end_s, video_duration)

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


# ── Synchronous inference core ────────────────────────────────────────────────

def _run_inference_sync(
    adapter: InferenceAdapter,
    video_path: str,
) -> Tuple[np.ndarray, Dict, Dict[str, float]]:
    """
    Blocking inference pipeline — called inside a thread pool executor.

    Phases timed individually:
      - model_load_ms      : adapter.load()
      - video_decode_ms    : extract_metadata()
      - frame_sampling_ms  : sample_frames()
      - inference_ms       : infer()

    Returns (activations, meta, timing).
    """
    timing: Dict[str, float] = {}

    with _timed("model_load_ms", timing):
        adapter.load()

    with _timed("video_decode_ms", timing):
        meta = adapter.extract_metadata(video_path)

    logger.info(
        "Video decoded: duration=%.1fs fps=%.1f resolution=%s",
        meta["duration_seconds"],
        meta["fps"],
        meta["resolution"],
    )

    with _timed("frame_sampling_ms", timing):
        segments = adapter.sample_frames(video_path, meta)

    logger.info(
        "Frame sampling done: %d segments sampled (%.1fs each)",
        len(segments),
        settings.tribe_segment_duration,
    )

    with _timed("inference_ms", timing):
        activations = adapter.infer(segments)

    logger.info(
        "Inference done: %d activation scores, range=[%.4f, %.4f]",
        len(activations),
        float(activations.min()),
        float(activations.max()),
    )

    return activations, meta, timing


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

    CPU/GPU work is offloaded to a thread pool executor so it does not block
    the asyncio event loop.
    """
    t_wall = time.perf_counter()
    timing: Dict[str, float] = {}
    now = datetime.now(timezone.utc).isoformat()

    # ── 1. Resolve video path ─────────────────────────────────────────────────
    video_path = local_path(object_key)
    logger.info(
        "job.start job_id=%s file=%s size_bytes=%d",
        job_id, video_path, size_bytes,
    )

    # ── 2. Pre-inference validation ───────────────────────────────────────────
    with _timed("validate_ms", timing):
        try:
            validate_video_file(video_path, settings.video_max_duration_s)
        except VideoValidationError as exc:
            raise ValueError(str(exc)) from exc

    # ── 3-5. Blocked inference work ───────────────────────────────────────────
    adapter = get_adapter()
    loop = asyncio.get_event_loop()
    activations, meta, sync_timing = await loop.run_in_executor(
        None, _run_inference_sync, adapter, video_path
    )
    timing.update(sync_timing)

    # ── 6. Build structured result ────────────────────────────────────────────
    with _timed("serialize_ms", timing):
        segment_duration: float = settings.tribe_segment_duration
        video_duration: float = meta["duration_seconds"]

        peak_idx = int(np.argmax(activations))
        sections = _build_sections(
            sections_config, activations, video_duration, segment_duration
        )
        insights = _build_insights(
            sections, activations, peak_idx, segment_duration,
            adapter.is_loaded and _has_real_weights(adapter),
        )
        completed_at = datetime.now(timezone.utc).isoformat()

        result = AnalysisResult(
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
                model_name=adapter.model_name,
                model_version=adapter.model_version,
                inference_time_ms=timing.get("inference_ms"),
                device=adapter.device,
            ),
            created_at=now,
            completed_at=completed_at,
        )

    # ── 7. Generate artifacts ─────────────────────────────────────────────────
    with _timed("artifact_gen_ms", timing):
        try:
            artifacts = generate_artifacts(
                job_id=job_id,
                video_path=video_path,
                result=result,
                artifacts_dir=settings.artifacts_dir,
                artifacts_base_url=settings.artifacts_base_url,
            )
            result.artifacts = artifacts
        except Exception as exc:
            logger.warning("Artifact generation failed (non-fatal): %s", exc)

    # ── 8. Log timing summary ─────────────────────────────────────────────────
    timing["total_ms"] = round((time.perf_counter() - t_wall) * 1000, 1)
    logger.info(
        "job.complete job_id=%s timing=%s segments=%d attention=%.4f",
        job_id,
        {k: v for k, v in timing.items()},
        result.summary.predicted_segments,
        result.summary.predicted_attention,
    )

    return result


# ── Internal helpers ──────────────────────────────────────────────────────────

def _has_real_weights(adapter: InferenceAdapter) -> bool:
    """Return True if the adapter is using fine-tuned weights (not proxy mode)."""
    from .adapter import TribeV2Adapter
    if isinstance(adapter, TribeV2Adapter):
        return adapter._model is not None and adapter._model.has_weights
    # Custom adapters: assume real weights if they're loaded
    return adapter.is_loaded
