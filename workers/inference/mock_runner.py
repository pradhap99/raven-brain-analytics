"""
Mock inference runner - returns deterministic fake results.
Generates rich brain analytics data for the enhanced UI.
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
    BenchmarkComparison,
    BrainRegionActivation,
    CognitiveLoad,
    EmotionalArc,
    EmotionLabel,
    EngagementZone,
    EngagementZoneMarker,
    HookAnalysis,
    InputMetadata,
    Insight,
    JobStatus,
    ModelMetadata,
    PacingMetrics,
    RetentionPoint,
    SectionScore,
    SummaryMetrics,
    TimelinePoint,
)

_DEFAULT_SECTIONS = {
    "hook": [0, 3],
    "intro": [3, 6],
    "main": [6, 10],
    "cta": [10, None],
}


def _simulate_timeline(duration: float = 15.0, n_segments: int = 15) -> List[float]:
    curve = []
    for i in range(n_segments):
        t = i / n_segments
        base = 0.55 + 0.2 * math.exp(-5 * (t - 0.1) ** 2)
        noise = random.uniform(-0.05, 0.05)
        val = max(0.0, min(1.0, base + noise))
        curve.append(round(val, 4))
    return curve


def _build_brain_regions(activation: float) -> BrainRegionActivation:
    return BrainRegionActivation(
        nacc=round(min(1.0, activation * 1.1 + random.uniform(-0.05, 0.05)), 4),
        mpfc=round(min(1.0, activation * 0.9 + random.uniform(-0.05, 0.05)), 4),
        ains=round(min(1.0, activation * 0.85 + random.uniform(-0.05, 0.1)), 4),
        visual_cortex=round(min(1.0, activation * 0.95 + random.uniform(-0.03, 0.08)), 4),
        amygdala=round(min(1.0, activation * 0.7 + random.uniform(-0.05, 0.15)), 4),
    )


def _build_emotional_arc(duration: float, n: int = 15) -> List[EmotionalArc]:
    emotions = list(EmotionLabel)
    arc = []
    for i in range(n):
        t = i / n
        valence = round(0.3 * math.sin(2 * math.pi * t) + random.uniform(-0.1, 0.1), 4)
        arousal = round(0.6 + 0.2 * math.cos(math.pi * t) + random.uniform(-0.05, 0.05), 4)
        valence = max(-1.0, min(1.0, valence))
        arousal = max(0.0, min(1.0, arousal))
        if arousal > 0.7 and valence > 0.1:
            emotion = EmotionLabel.excitement
        elif arousal > 0.6 and valence > -0.1:
            emotion = EmotionLabel.curiosity
        elif arousal > 0.7 and valence < -0.1:
            emotion = EmotionLabel.surprise
        elif arousal < 0.4:
            emotion = EmotionLabel.boredom
        else:
            emotion = EmotionLabel.neutral
        arc.append(EmotionalArc(
            second=round(i * duration / n, 2),
            valence=valence,
            arousal=arousal,
            dominant_emotion=emotion,
        ))
    return arc


def _build_retention_curve(duration: float, n: int = 15) -> List[RetentionPoint]:
    pts = []
    for i in range(n):
        t = i / n
        base = 100 * math.exp(-0.8 * t)
        noise = random.uniform(-3, 3)
        pct = max(0.0, min(100.0, round(base + noise, 1)))
        pts.append(RetentionPoint(
            second=round(i * duration / n, 2),
            retention_pct=pct,
        ))
    return pts


def _build_engagement_zones(duration: float) -> List[EngagementZoneMarker]:
    zones = [
        EngagementZoneMarker(start_seconds=0, end_seconds=2.5, zone=EngagementZone.high, label="Hook Impact", score=0.88),
        EngagementZoneMarker(start_seconds=2.5, end_seconds=5.0, zone=EngagementZone.medium, label="Intro Build", score=0.65),
        EngagementZoneMarker(start_seconds=5.0, end_seconds=9.0, zone=EngagementZone.high, label="Core Content", score=0.82),
        EngagementZoneMarker(start_seconds=9.0, end_seconds=12.0, zone=EngagementZone.low, label="Plateau", score=0.45),
        EngagementZoneMarker(start_seconds=12.0, end_seconds=duration, zone=EngagementZone.drop, label="CTA Drop-off", score=0.32),
    ]
    return zones


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
        start_idx = min(int(start / video_duration * n), n - 1)
        end_idx = min(int(end / video_duration * n), n)
        segment_vals = timeline[start_idx:end_idx] if end_idx > start_idx else [0.5]
        score = round(sum(segment_vals) / len(segment_vals), 4)
        results.append(SectionScore(name=name, start_seconds=start, end_seconds=end if bounds[1] is not None else None, score=score, rank=0))
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
    t0 = time.time()
    await asyncio.sleep(2)

    video_duration = 15.0
    timeline_vals = _simulate_timeline(video_duration)
    peak_idx = int(max(range(len(timeline_vals)), key=lambda i: timeline_vals[i]))
    sections = _build_sections(sections_config, timeline_vals, video_duration)
    best_section = sections[0].name if sections else "hook"
    worst_section = sections[-1].name if sections else "cta"
    inference_ms = round((time.time() - t0) * 1000, 1)
    now = datetime.now(timezone.utc).isoformat()

    avg_att = round(sum(timeline_vals) / len(timeline_vals), 4)
    emotional_arc = _build_emotional_arc(video_duration)
    avg_valence = round(sum(e.valence for e in emotional_arc) / len(emotional_arc), 4)
    avg_arousal = round(sum(e.arousal for e in emotional_arc) / len(emotional_arc), 4)
    retention_curve = _build_retention_curve(video_duration)
    final_retention = retention_curve[-1].retention_pct

    brain_summary = _build_brain_regions(avg_att)

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
            predicted_attention=avg_att,
            peak_activation=round(max(timeline_vals), 4),
            peak_segment=peak_idx,
            cta_strength=round(timeline_vals[-1], 4),
            cognitive_load=CognitiveLoad.medium,
            predicted_segments=len(timeline_vals),
            avg_valence=avg_valence,
            avg_arousal=avg_arousal,
            predicted_retention_pct=round(final_retention, 1),
            virality_score=round(min(1.0, avg_att * 1.2 + random.uniform(0, 0.15)), 4),
            overall_grade="A" if avg_att > 0.65 else "B" if avg_att > 0.5 else "C",
        ),
        sections=sections,
        timeline=[
            TimelinePoint(
                segment_index=i,
                second=round(i * video_duration / len(timeline_vals), 2),
                activation=v,
                brain_regions=_build_brain_regions(v),
            )
            for i, v in enumerate(timeline_vals)
        ],
        insights=[
            Insight(type="primary", text=f"Your '{best_section}' section drives the strongest brain activation, peaking at segment {peak_idx}.", confidence=0.91, icon="brain"),
            Insight(type="weakness", text=f"The '{worst_section}' section shows the lowest activation. Consider tightening or adding a pattern interrupt.", confidence=0.85, icon="alert-triangle"),
            Insight(type="recommendation", text="Move your highest-performing hook element to the first 1.5s to capture attention before the scroll reflex.", confidence=0.88, icon="zap"),
            Insight(type="hook", text=f"First-frame scroll-stop probability is {round(random.uniform(0.6, 0.9), 2)}. Strong visual contrast helps.", confidence=0.82, icon="eye"),
            Insight(type="emotion", text=f"Dominant emotional response: curiosity in first 5s, shifting to excitement during core content.", confidence=0.79, icon="heart"),
            Insight(type="retention", text=f"Predicted {round(final_retention, 1)}% viewers watch to end. Top 10% reels retain 55%+.", confidence=0.84, icon="users"),
            Insight(type="general", text="Overall attention is above the 60th percentile for IG Reels in this category.", confidence=0.78, icon="bar-chart"),
        ],
        artifacts=[],
        model_meta=ModelMetadata(
            model_name="mock-tribe-v2",
            model_version="0.2.0-mock",
            inference_time_ms=inference_ms,
            device="cpu",
        ),
        created_at=now,
        completed_at=now,
        brain_regions_summary=brain_summary,
        emotional_arc=emotional_arc,
        retention_curve=retention_curve,
        engagement_zones=_build_engagement_zones(video_duration),
        pacing=PacingMetrics(
            avg_scene_duration=round(random.uniform(1.5, 3.0), 2),
            scene_count=random.randint(4, 8),
            visual_change_rate=round(random.uniform(0.5, 1.5), 2),
            pacing_score=round(random.uniform(0.6, 0.9), 4),
            rhythm_consistency=round(random.uniform(0.5, 0.85), 4),
        ),
        benchmark=BenchmarkComparison(
            category="ig_reels_lifestyle",
            percentile=random.randint(55, 85),
            avg_attention_in_category=0.52,
            your_attention=avg_att,
            top_10_pct_threshold=0.72,
            sample_size=12480,
        ),
        hook_analysis=HookAnalysis(
            scroll_stop_probability=round(random.uniform(0.6, 0.92), 4),
            hook_strength=round(random.uniform(0.65, 0.95), 4),
            time_to_peak_ms=random.randint(400, 1200),
            first_frame_score=round(random.uniform(0.5, 0.9), 4),
            recommendation="Strong opening contrast. Consider adding text overlay in first 0.5s for extra scroll-stop power.",
        ),
    )
