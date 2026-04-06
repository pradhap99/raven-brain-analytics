"""
Result artifact generation for Tribe V2 inference.

Generates three artifacts per completed job:

1. ``timeline.png``   — engagement activation chart (always produced)
2. ``summary.json``   — summary metrics + section scores as JSON (always produced)
3. ``thumbnails.png`` — horizontal strip of keyframe thumbnails (skipped if
                        optional deps are unavailable or the video can't be read)

Artifacts are written to ``{ARTIFACTS_DIR}/{job_id}/`` and exposed via the API
at ``{ARTIFACTS_BASE_URL}/{job_id}/{filename}``.
"""
from __future__ import annotations

import json
import logging
import os
from typing import TYPE_CHECKING, List, Optional

if TYPE_CHECKING:
    from packages.types import AnalysisResult, Artifact

logger = logging.getLogger(__name__)


# ── Timeline PNG ──────────────────────────────────────────────────────────────

def generate_timeline_png(
    job_id: str,
    result: "AnalysisResult",
    output_dir: str,
    base_url: str,
) -> "Artifact":
    """
    Render the per-segment engagement curve as a PNG chart.

    Uses matplotlib in non-interactive mode (Agg backend) so it works on
    headless servers without a display.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    from packages.types import Artifact

    seconds = [pt.second for pt in result.timeline]
    activations = [pt.activation for pt in result.timeline]
    peak_idx = result.summary.peak_segment

    fig, ax = plt.subplots(figsize=(10, 3.5), facecolor="#0a0a1a")
    ax.set_facecolor("#111827")

    # Filled area
    ax.fill_between(seconds, activations, alpha=0.15, color="#6366f1")
    ax.plot(seconds, activations, color="#6366f1", linewidth=2.5, label="Brain Activation")

    # Peak marker
    if 0 <= peak_idx < len(seconds):
        ax.scatter(
            [seconds[peak_idx]], [activations[peak_idx]],
            s=100, color="#f59e0b", zorder=5, label="Peak"
        )
        ax.annotate(
            "Peak",
            xy=(seconds[peak_idx], activations[peak_idx]),
            xytext=(seconds[peak_idx] + 0.3, min(activations[peak_idx] + 0.06, 0.98)),
            color="#f59e0b", fontsize=8,
        )

    # Section shading
    for sec in result.sections:
        start = sec.start_seconds
        end = sec.end_seconds if sec.end_seconds is not None else (seconds[-1] if seconds else start)
        alpha = 0.06
        ax.axvspan(start, end, alpha=alpha, color="#a78bfa")
        mid = (start + end) / 2
        ax.text(
            mid, 0.03, sec.name, color="#94a3b8", fontsize=7,
            ha="center", va="bottom", transform=ax.get_xaxis_transform(),
        )

    ax.set_xlim(left=0)
    ax.set_ylim(0, 1.05)
    ax.set_xlabel("Time (s)", color="#94a3b8", fontsize=9)
    ax.set_ylabel("Activation", color="#94a3b8", fontsize=9)
    ax.set_title("Brain Engagement Timeline", color="#f1f5f9", fontsize=11, pad=8)
    ax.tick_params(colors="#64748b")
    for spine in ax.spines.values():
        spine.set_edgecolor("#2d3748")

    fig.tight_layout(pad=1.0)

    out_path = os.path.join(output_dir, "timeline.png")
    fig.savefig(out_path, dpi=120, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    logger.debug("Artifact timeline.png written to %s", out_path)

    return Artifact(
        name="timeline.png",
        url=f"{base_url}/{job_id}/timeline.png",
        mime_type="image/png",
    )


# ── Summary JSON ──────────────────────────────────────────────────────────────

def generate_summary_json(
    job_id: str,
    result: "AnalysisResult",
    output_dir: str,
    base_url: str,
) -> "Artifact":
    """
    Write summary metrics, section scores, and insights to a JSON file.
    """
    from packages.types import Artifact

    payload = {
        "job_id": job_id,
        "model_version": result.model_meta.model_version,
        "device": result.model_meta.device,
        "inference_time_ms": result.model_meta.inference_time_ms,
        "duration_seconds": result.input.duration_seconds,
        "fps": result.input.fps,
        "resolution": result.input.resolution,
        "summary": result.summary.model_dump(),
        "sections": [s.model_dump() for s in result.sections],
        "insights": [i.model_dump() for i in result.insights],
        "created_at": result.created_at,
        "completed_at": result.completed_at,
    }

    out_path = os.path.join(output_dir, "summary.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
    logger.debug("Artifact summary.json written to %s", out_path)

    return Artifact(
        name="summary.json",
        url=f"{base_url}/{job_id}/summary.json",
        mime_type="application/json",
    )


# ── Thumbnail strip ───────────────────────────────────────────────────────────

def generate_thumbnail_strip(
    job_id: str,
    video_path: str,
    n_thumbs: int,
    output_dir: str,
    base_url: str,
    thumb_width: int = 120,
    thumb_height: int = 68,
) -> Optional["Artifact"]:
    """
    Capture *n_thumbs* evenly-spaced keyframes and tile them into a single PNG.

    Returns ``None`` if the video cannot be opened or any dependency is missing.
    """
    try:
        import cv2
        import numpy as np
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from packages.types import Artifact
    except ImportError as exc:
        logger.warning("Skipping thumbnail strip — missing dependency: %s", exc)
        return None

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        logger.warning("Skipping thumbnail strip — cannot open: %s", video_path)
        return None

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total_frames < n_thumbs:
        n_thumbs = max(1, total_frames)

    indices = [int(i) for i in np.linspace(0, total_frames - 1, n_thumbs)]
    thumbs = []
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            # Resize to thumb size
            resized = cv2.resize(frame_rgb, (thumb_width, thumb_height))
            thumbs.append(resized)
    cap.release()

    if not thumbs:
        logger.warning("Skipping thumbnail strip — no frames captured from %s", video_path)
        return None

    n = len(thumbs)
    strip = np.zeros((thumb_height, n * thumb_width, 3), dtype=np.uint8)
    for i, t in enumerate(thumbs):
        strip[:, i * thumb_width : (i + 1) * thumb_width] = t

    fig, ax = plt.subplots(figsize=(n * thumb_width / 96, thumb_height / 96), facecolor="#0a0a1a")
    ax.imshow(strip)
    ax.axis("off")
    fig.subplots_adjust(left=0, right=1, top=1, bottom=0)

    out_path = os.path.join(output_dir, "thumbnails.png")
    fig.savefig(out_path, dpi=96, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    logger.debug("Artifact thumbnails.png written to %s", out_path)

    return Artifact(
        name="thumbnails.png",
        url=f"{base_url}/{job_id}/thumbnails.png",
        mime_type="image/png",
    )


# ── Orchestrator ──────────────────────────────────────────────────────────────

def generate_artifacts(
    job_id: str,
    video_path: str,
    result: "AnalysisResult",
    artifacts_dir: str,
    artifacts_base_url: str,
    n_thumbs: int = 8,
) -> List["Artifact"]:
    """
    Generate all per-job artifacts and return a list of populated ``Artifact`` objects.

    Individual generators catch their own errors; a failure in one does not
    prevent the others from running.
    """
    job_dir = os.path.join(artifacts_dir, job_id)
    os.makedirs(job_dir, exist_ok=True)

    artifacts = []

    try:
        artifacts.append(
            generate_timeline_png(job_id, result, job_dir, artifacts_base_url)
        )
    except Exception as exc:
        logger.warning("timeline.png generation failed: %s", exc)

    try:
        artifacts.append(
            generate_summary_json(job_id, result, job_dir, artifacts_base_url)
        )
    except Exception as exc:
        logger.warning("summary.json generation failed: %s", exc)

    try:
        thumb = generate_thumbnail_strip(
            job_id, video_path, n_thumbs, job_dir, artifacts_base_url
        )
        if thumb is not None:
            artifacts.append(thumb)
    except Exception as exc:
        logger.warning("thumbnails.png generation failed: %s", exc)

    logger.info(
        "Job %s: generated %d artifact(s): %s",
        job_id,
        len(artifacts),
        [a.name for a in artifacts],
    )
    return artifacts
