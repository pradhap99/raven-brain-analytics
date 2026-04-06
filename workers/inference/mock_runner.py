"""
Mock inference runner — returns deterministic fake results.
Lets the UI work end-to-end before the real model is integrated.
"""
from __future__ import annotations

import asyncio
import math
import random
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from packages.types import (
    AnalysisResult,
    Artifact,
    CognitiveLoad,
    InputMetadata,
    Insight,
    JobStatus,
    ModelMetadata,
    SectionScore,
    SummaryMetrics,
    TimelinePoint,
)

# Default section config used when caller doesn't supply one
_DEFAULT_SECTIONS = {
    "hook": [0, 3],
    "intro": [3, 6],
    "main": [6, 10],
    "cta": [10, None],
}


def _simulate_timeline(duration: float = 15.0, n_segments: int = 15) -> List[float]:
    """Generate a plausible engagement curve with a hook spike and CTA dip."""
    curve = []
    for i in range(n_segments):
        t = i / n_segments
        # Hook spike, main plateau, CTA dip
        base = 0.55 + 0.2 * math.exp(-5 * (t - 0.1) ** 2)
        noise = random.uniform(-0.05, 0.05)
        val = max(0.0, min(1.0, base + noise))
        curve.append(round(val, 4))
    return curve


def _build_sections(
    sections_config: Optional[Dict[str, Any]],
    timeline: List[float],
    video_duration: float,
) -> List[SectionScore]:
    cfg = sections_config or _DEFAULT_SECTIONS
    n = len(timeline)
    results = []
    for name, bounds in cfg.items():
        start = float(bounds[0])
        end = float(bounds[1]) if bounds[1] is not None else video_duration
        # Map time range to timeline indices
        start_idx = min(int(start / video_duration * n), n - 1)
        end_idx = min(int(end / video_duration * n), n)
        segment_vals = timeline[start_idx:end_idx] if end_idx > start_idx else [0.5]
        score = round(sum(segment_vals) / len(segment_vals), 4)
        results.append(
            SectionScore(
                name=name,
                start_seconds=start,
                end_seconds=end if bounds[1] is not None else None,
                score=score,
                rank=0,  # filled in below
            )
        )
    # Rank by score descending
    results.sort(key=lambda s: s.score, reverse=True)
    for i, sec in enumerate(results):
        sec.rank = i + 1
    return results


async def process_job(
    job_id: str,
    object_key: str,
    filename: str,
    size_bytes: int,
    sections_config: Optional[Dict[str, Any]] = None,
) -> AnalysisResult:
    """
    Mock processor: simulates a ~2 second inference run and returns a
    deterministic-ish AnalysisResult.
    """
    t0 = time.time()

    # Simulate async work (e.g. model forward pass)
    await asyncio.sleep(2)

    video_duration = 15.0  # assume 15s reel for mock
    timeline_vals = _simulate_timeline(video_duration)
    peak_idx = int(max(range(len(timeline_vals)), key=lambda i: timeline_vals[i]))
    sections = _build_sections(sections_config, timeline_vals, video_duration)
    best_section = sections[0].name if sections else "hook"
    worst_section = sections[-1].name if sections else "cta"

    inference_ms = round((time.time() - t0) * 1000, 1)
    now = datetime.now(timezone.utc).isoformat()

    return AnalysisResult(
        job_id=job_id,
        status=JobStatus.completed,
        input=InputMetadata(
            filename=filename,
            size_bytes=size_bytes,
            duration_seconds=video_duration,
            fps=30.0,
            resolution="1080x1920",
            upload_url=f"local://{object_key}",
        ),
        summary=SummaryMetrics(
            predicted_attention=round(sum(timeline_vals) / len(timeline_vals), 4),
            peak_activation=round(max(timeline_vals), 4),
            peak_segment=peak_idx,
            cta_strength=round(timeline_vals[-1], 4),
            cognitive_load=CognitiveLoad.medium,
            predicted_segments=len(timeline_vals),
        ),
        sections=sections,
        timeline=[
            TimelinePoint(
                segment_index=i,
                second=round(i * video_duration / len(timeline_vals), 2),
                activation=v,
            )
            for i, v in enumerate(timeline_vals)
        ],
        insights=[
            Insight(
                type="primary",
                text=f"Your '{best_section}' section drives the strongest brain activation, peaking at segment {peak_idx}. This is where viewers are most engaged.",
                confidence=0.91,
            ),
            Insight(
                type="weakness",
                text=f"The '{worst_section}' section shows the lowest activation score. Consider tightening this segment or adding a pattern interrupt.",
                confidence=0.85,
            ),
            Insight(
                type="recommendation",
                text="Move your highest-performing hook element to the first 1.5 seconds to capture attention before the scroll reflex activates.",
                confidence=0.88,
            ),
            Insight(
                type="general",
                text="Overall attention score is above the 60th percentile for IG Reels in this category.",
                confidence=0.78,
            ),
        ],
        artifacts=[],
        model_meta=ModelMetadata(
            model_name="mock-tribe-v2",
            model_version="0.1.0-mock",
            inference_time_ms=inference_ms,
            device="cpu",
        ),
        created_at=now,
        completed_at=now,
    )
