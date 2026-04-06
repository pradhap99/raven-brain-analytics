"""
Integration test for MOCK_INFERENCE=false (real inference pipeline).

Skipped automatically unless the required ML dependencies are importable:
    - torch
    - cv2  (opencv-python-headless)
    - transformers

Run manually:
    PYTHONPATH=. pytest workers/inference/tests/test_integration.py -v

Or with a real video:
    PYTHONPATH=. REAL_VIDEO=/path/to/reel.mp4 \\
        pytest workers/inference/tests/test_integration.py -v -s
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import uuid

import numpy as np
import pytest

# ── Skip the entire module if ML dependencies aren't installed ────────────────
torch = pytest.importorskip("torch", reason="torch not installed — skipping real-inference tests")
cv2 = pytest.importorskip("cv2", reason="opencv-python-headless not installed — skipping real-inference tests")
pytest.importorskip("transformers", reason="transformers not installed — skipping real-inference tests")

# ── Ensure repo root is importable ────────────────────────────────────────────
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from packages.types import AnalysisResult, JobStatus
from workers.inference.adapter import TribeV2Adapter, get_adapter
from workers.inference.validation import validate_video_file, VideoValidationError
from workers.inference.artifacts import generate_artifacts


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def synthetic_video(tmp_path_factory) -> str:
    """Create a 5-second synthetic MP4 (random colour frames) for the session."""
    tmp_dir = tmp_path_factory.mktemp("raven_integration")
    video_path = str(tmp_dir / "synthetic_reel.mp4")
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(video_path, fourcc, 10, (320, 240))
    rng = np.random.default_rng(seed=42)
    for _ in range(50):  # 5 seconds at 10 fps
        frame_rgb = rng.integers(0, 256, (240, 320, 3), dtype=np.uint8)
        writer.write(cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR))
    writer.release()
    assert os.path.isfile(video_path), "synthetic video not created"
    return video_path


@pytest.fixture(scope="session")
def real_video() -> str | None:
    """Return path to a real video if REAL_VIDEO env var is set, else None."""
    path = os.getenv("REAL_VIDEO")
    if path and os.path.isfile(path):
        return path
    return None


# ── Validation tests ──────────────────────────────────────────────────────────

class TestVideoValidation:
    def test_valid_video_passes(self, synthetic_video):
        duration = validate_video_file(synthetic_video, max_duration_s=300)
        assert 0 < duration <= 300

    def test_missing_file_raises(self, tmp_path):
        with pytest.raises(VideoValidationError, match="not found"):
            validate_video_file(str(tmp_path / "nonexistent.mp4"), 300)

    def test_duration_limit_exceeded(self, synthetic_video):
        # 5-second video should fail with a 3-second limit
        with pytest.raises(VideoValidationError, match="duration"):
            validate_video_file(synthetic_video, max_duration_s=3.0)

    def test_corrupt_file_raises(self, tmp_path):
        bad = tmp_path / "corrupt.mp4"
        bad.write_bytes(b"not a video")
        with pytest.raises(VideoValidationError):
            validate_video_file(str(bad), 300)


# ── Adapter tests ─────────────────────────────────────────────────────────────

class TestTribeV2Adapter:
    @pytest.fixture(autouse=True)
    def _reset_adapter(self):
        """Ensure each test gets a fresh adapter."""
        import workers.inference.adapter as _adp
        _adp._ADAPTER_INSTANCE = None
        import workers.inference.tribe_model as _tm
        _tm._MODEL_INSTANCE = None
        yield
        _adp._ADAPTER_INSTANCE = None
        _tm._MODEL_INSTANCE = None

    def test_adapter_lifecycle_backbone_only(self, synthetic_video):
        adapter = TribeV2Adapter(
            weights_path=None,
            backbone_id="openai/clip-vit-base-patch32",
            device="cpu",
            segment_duration=1.0,
            frames_per_segment=4,
        )
        assert not adapter.is_loaded
        adapter.load()
        assert adapter.is_loaded
        # Idempotent
        adapter.load()
        assert adapter.is_loaded

    def test_extract_metadata(self, synthetic_video):
        adapter = TribeV2Adapter(device="cpu", segment_duration=1.0, frames_per_segment=4)
        meta = adapter.extract_metadata(synthetic_video)
        assert meta["duration_seconds"] > 0
        assert meta["fps"] > 0
        assert "resolution" in meta

    def test_sample_frames(self, synthetic_video):
        adapter = TribeV2Adapter(device="cpu", segment_duration=1.0, frames_per_segment=4)
        meta = adapter.extract_metadata(synthetic_video)
        segments = adapter.sample_frames(synthetic_video, meta)
        assert len(segments) >= 1
        for seg in segments:
            assert len(seg) >= 1
            assert seg[0].ndim == 3 and seg[0].shape[2] == 3  # H×W×3

    def test_infer_scores_in_range(self, synthetic_video):
        adapter = TribeV2Adapter(device="cpu", segment_duration=1.0, frames_per_segment=4)
        adapter.load()
        meta = adapter.extract_metadata(synthetic_video)
        segments = adapter.sample_frames(synthetic_video, meta)
        scores = adapter.infer(segments)
        assert scores.shape == (len(segments),)
        assert np.all(scores >= 0.0) and np.all(scores <= 1.0)


# ── Full pipeline test ────────────────────────────────────────────────────────

class TestFullPipeline:
    @pytest.fixture(autouse=True)
    def _reset(self):
        import workers.inference.adapter as _adp
        _adp._ADAPTER_INSTANCE = None
        import workers.inference.tribe_model as _tm
        _tm._MODEL_INSTANCE = None
        yield
        _adp._ADAPTER_INSTANCE = None
        _tm._MODEL_INSTANCE = None

    def _run(self, video_path: str) -> AnalysisResult:
        """Helper: patch local_path and run process_job."""
        import workers.inference.runner as runner_mod
        from apps.api import config as _cfg

        _cfg.settings.local_upload_dir = os.path.dirname(video_path)
        orig_local_path = runner_mod.local_path
        basename = os.path.basename(video_path)
        runner_mod.local_path = lambda key: video_path

        try:
            return asyncio.get_event_loop().run_until_complete(
                runner_mod.process_job(
                    job_id=str(uuid.uuid4()),
                    object_key=basename,
                    filename=basename,
                    size_bytes=os.path.getsize(video_path),
                )
            )
        finally:
            runner_mod.local_path = orig_local_path

    def test_synthetic_video_schema(self, synthetic_video, tmp_path):
        from apps.api import config as _cfg
        _cfg.settings.artifacts_dir = str(tmp_path / "artifacts")

        result = self._run(synthetic_video)

        assert result.status == JobStatus.completed
        assert result.input.duration_seconds > 0
        assert 0.0 <= result.summary.predicted_attention <= 1.0
        assert 0.0 <= result.summary.peak_activation <= 1.0
        assert 0.0 <= result.summary.cta_strength <= 1.0
        assert result.summary.predicted_segments >= 1
        assert 0 <= result.summary.peak_segment < result.summary.predicted_segments
        assert result.summary.cognitive_load in ("low", "medium", "high")
        assert len(result.timeline) == result.summary.predicted_segments
        for pt in result.timeline:
            assert 0.0 <= pt.activation <= 1.0
        assert len(result.sections) > 0
        ranks = sorted(s.rank for s in result.sections)
        assert ranks == list(range(1, len(result.sections) + 1))
        types_ = {i.type for i in result.insights}
        for req in ("primary", "weakness", "recommendation", "general"):
            assert req in types_, f"missing insight type: {req}"
        assert result.model_meta.model_name == "tribe-v2"
        assert result.model_meta.inference_time_ms is not None

    def test_artifacts_generated(self, synthetic_video, tmp_path):
        from apps.api import config as _cfg
        artifact_dir = str(tmp_path / "artifacts")
        _cfg.settings.artifacts_dir = artifact_dir
        _cfg.settings.artifacts_base_url = "http://localhost:8000/v1/artifacts"

        result = self._run(synthetic_video)

        artifact_names = {a.name for a in result.artifacts}
        assert "timeline.png" in artifact_names, "timeline.png not generated"
        assert "summary.json" in artifact_names, "summary.json not generated"

    @pytest.mark.skipif(
        os.getenv("REAL_VIDEO") is None,
        reason="REAL_VIDEO env var not set",
    )
    def test_real_video(self, real_video, tmp_path):
        from apps.api import config as _cfg
        _cfg.settings.artifacts_dir = str(tmp_path / "artifacts")
        assert real_video is not None

        result = self._run(real_video)

        assert result.status == JobStatus.completed
        assert result.summary.predicted_segments >= 1
        print(f"\n  Real video: duration={result.input.duration_seconds:.1f}s")
        print(f"  Attention: {result.summary.predicted_attention:.4f}")
        print(f"  Peak: seg {result.summary.peak_segment} @ {result.summary.peak_activation:.4f}")


# ── Artifact generation standalone test ──────────────────────────────────────

class TestArtifacts:
    def test_generate_artifacts(self, synthetic_video, tmp_path):
        """Generate artifacts from a mock result without running inference."""
        from packages.types import (
            AnalysisResult, JobStatus, InputMetadata, SummaryMetrics,
            SectionScore, TimelinePoint, Insight, ModelMetadata, CognitiveLoad,
        )
        mock_activations = np.linspace(0.3, 0.8, 10)
        job_id = str(uuid.uuid4())

        result = AnalysisResult(
            job_id=job_id,
            status=JobStatus.completed,
            input=InputMetadata(filename="test.mp4", size_bytes=1000, duration_seconds=10.0),
            summary=SummaryMetrics(
                predicted_attention=0.55, peak_activation=0.8, peak_segment=9,
                cta_strength=0.8, cognitive_load=CognitiveLoad.medium, predicted_segments=10,
            ),
            sections=[
                SectionScore(name="hook", start_seconds=0, end_seconds=3, score=0.6, rank=1),
                SectionScore(name="cta", start_seconds=7, end_seconds=10, score=0.4, rank=2),
            ],
            timeline=[
                TimelinePoint(segment_index=i, second=float(i), activation=round(float(v), 4))
                for i, v in enumerate(mock_activations)
            ],
            insights=[
                Insight(type="primary", text="Strong hook.", confidence=0.9),
                Insight(type="weakness", text="Weak CTA.", confidence=0.8),
                Insight(type="recommendation", text="Add pattern interrupt.", confidence=0.85),
                Insight(type="general", text="Above median.", confidence=0.7),
            ],
            artifacts=[],
            model_meta=ModelMetadata(
                model_name="tribe-v2", model_version="2.0.0-backbone-proxy",
                inference_time_ms=1200.0, device="cpu",
            ),
            created_at="2026-01-01T00:00:00+00:00",
        )

        artifact_dir = str(tmp_path / "artifacts")
        artifacts = generate_artifacts(
            job_id=job_id,
            video_path=synthetic_video,
            result=result,
            artifacts_dir=artifact_dir,
            artifacts_base_url="http://localhost:8000/v1/artifacts",
        )

        names = {a.name for a in artifacts}
        assert "timeline.png" in names
        assert "summary.json" in names

        job_dir = os.path.join(artifact_dir, job_id)
        assert os.path.isfile(os.path.join(job_dir, "timeline.png"))
        assert os.path.isfile(os.path.join(job_dir, "summary.json"))
