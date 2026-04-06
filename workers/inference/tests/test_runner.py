"""
Smoke test for the real Tribe V2 inference runner.

Usage
-----
# Run with a synthetic 5-second video (auto-generated, no file needed):
    PYTHONPATH=. python workers/inference/tests/test_runner.py

# Run with a real video file:
    PYTHONPATH=. python workers/inference/tests/test_runner.py /path/to/reel.mp4

The test validates that:
  - The full async pipeline completes without error.
  - The returned AnalysisResult is schema-valid.
  - All required fields are present and within expected ranges.
  - The timeline, sections, and insight types are correctly populated.
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import time
import uuid

import numpy as np

# ── Optional cv2 — used to create the synthetic test video ───────────────────
try:
    import cv2
    _HAS_CV2 = True
except ImportError:
    _HAS_CV2 = False

# ── Ensure repo root is on the path when run directly ────────────────────────
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from packages.types import AnalysisResult, JobStatus


# ── Synthetic video factory ───────────────────────────────────────────────────

def _make_synthetic_video(path: str, duration_s: float = 5.0, fps: int = 10) -> None:
    """Write a short synthetic MP4 with random-colour frames to *path*."""
    if not _HAS_CV2:
        raise RuntimeError(
            "opencv-python-headless is required to create the synthetic test video. "
            "Install it with: pip install opencv-python-headless"
        )
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(path, fourcc, fps, (320, 240))
    n_frames = int(duration_s * fps)
    rng = np.random.default_rng(seed=42)
    for _ in range(n_frames):
        frame_rgb = (rng.integers(0, 256, (240, 320, 3), dtype=np.uint8))
        writer.write(cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR))
    writer.release()


# ── Core test logic ───────────────────────────────────────────────────────────

async def _run_test(video_path: str) -> None:
    """Drive the full runner pipeline and assert schema validity."""
    # Patch the config so local_path() resolves to the temp file directory.
    from apps.api import config as _cfg
    upload_dir = os.path.dirname(video_path)
    _cfg.settings.local_upload_dir = upload_dir

    # Build an object_key that maps back to the temp file via local_path().
    # local_path() does: os.path.join(upload_dir, object_key.replace("/", "_"))
    # So object_key must be: "uploads/<basename>" and the file must be named
    # "uploads_<basename>" inside upload_dir — or we can just match directly.
    basename = os.path.basename(video_path)
    # local_path replaces "/" with "_", so "uploads/X" → "uploads_X"
    # We need local_path(object_key) == video_path.
    # Simplest: object_key is the basename itself (no slash), file lives in upload_dir.
    object_key = basename

    # Temporarily override local_path to return video_path for this object_key.
    import workers.inference.runner as runner_mod
    original_local_path = runner_mod.local_path

    def _patched_local_path(key: str) -> str:
        if key == object_key:
            return video_path
        return original_local_path(key)

    runner_mod.local_path = _patched_local_path

    try:
        job_id = str(uuid.uuid4())
        t0 = time.time()

        result: AnalysisResult = await runner_mod.process_job(
            job_id=job_id,
            object_key=object_key,
            filename=basename,
            size_bytes=os.path.getsize(video_path),
        )

        elapsed = time.time() - t0
        print(f"  Inference completed in {elapsed:.1f}s")
    finally:
        runner_mod.local_path = original_local_path

    # ── Assertions ────────────────────────────────────────────────────────────
    assert result.job_id == job_id, "job_id mismatch"
    assert result.status == JobStatus.completed, f"unexpected status: {result.status}"

    # Input metadata
    assert result.input.filename == basename
    assert result.input.duration_seconds > 0

    # Summary
    s = result.summary
    assert 0.0 <= s.predicted_attention <= 1.0, "predicted_attention out of range"
    assert 0.0 <= s.peak_activation <= 1.0, "peak_activation out of range"
    assert 0.0 <= s.cta_strength <= 1.0, "cta_strength out of range"
    assert s.predicted_segments >= 1, "no segments"
    assert 0 <= s.peak_segment < s.predicted_segments, "peak_segment out of range"
    assert s.cognitive_load in ("low", "medium", "high"), "invalid cognitive_load"

    # Timeline
    assert len(result.timeline) == s.predicted_segments, "timeline length mismatch"
    for pt in result.timeline:
        assert 0.0 <= pt.activation <= 1.0, f"activation {pt.activation} out of range"

    # Sections
    assert len(result.sections) > 0, "no sections"
    ranks = sorted(sec.rank for sec in result.sections)
    assert ranks == list(range(1, len(result.sections) + 1)), "section ranks invalid"

    # Insights
    insight_types = {ins.type for ins in result.insights}
    for required in ("primary", "weakness", "recommendation"):
        assert required in insight_types, f"missing insight type: {required}"

    # Model metadata
    assert result.model_meta.model_name == "tribe-v2"
    assert result.model_meta.inference_time_ms is not None

    print("  All assertions passed ✓")
    print(f"  Segments        : {s.predicted_segments}")
    print(f"  Duration        : {result.input.duration_seconds:.1f}s")
    print(f"  Attention score : {s.predicted_attention:.4f}")
    print(f"  Peak activation : {s.peak_activation:.4f} (seg {s.peak_segment})")
    print(f"  Cognitive load  : {s.cognitive_load}")
    print(f"  Model version   : {result.model_meta.model_version}")
    print(f"  Device          : {result.model_meta.device}")
    print("  Sections:")
    for sec in result.sections:
        print(f"    [{sec.rank}] {sec.name:<8} {sec.score:.4f}")
    print("  Insights:")
    for ins in result.insights:
        print(f"    [{ins.type:<16}] {ins.text[:80]}…")


def main() -> None:
    # Determine video path
    if len(sys.argv) > 1:
        video_path = sys.argv[1]
        if not os.path.isfile(video_path):
            print(f"ERROR: file not found: {video_path}", file=sys.stderr)
            sys.exit(1)
        print(f"Using provided video: {video_path}")
        tmp_path = None
    else:
        # Create a temporary synthetic video
        tmp_dir = tempfile.mkdtemp(prefix="raven_test_")
        tmp_path = os.path.join(tmp_dir, "synthetic_reel.mp4")
        print(f"Creating 5s synthetic test video at: {tmp_path}")
        _make_synthetic_video(tmp_path, duration_s=5.0)
        video_path = tmp_path

    print("\nRunning Tribe V2 real inference pipeline…\n")
    asyncio.run(_run_test(video_path))

    if tmp_path and os.path.exists(tmp_path):
        os.remove(tmp_path)

    print("\nTest PASSED")


if __name__ == "__main__":
    main()
