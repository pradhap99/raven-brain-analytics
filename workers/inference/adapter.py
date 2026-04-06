"""
Inference adapter layer for Tribe V2.

Purpose
-------
Decouples the API-facing runner from the specific preprocessing and model-scoring
implementation.  Any notebook-era logic (custom frame extraction, alternate model
architectures, etc.) can be introduced by subclassing ``InferenceAdapter`` without
touching ``runner.py`` or any API routes.

The concrete adapter used at runtime is selected by ``get_adapter()`` which reads
from ``apps.api.config.settings``.

Usage
-----
To plug in a custom implementation:

    1. Subclass ``InferenceAdapter`` and implement the four abstract methods.
    2. Register it in ``get_adapter()`` or inject it via the ``INFERENCE_ADAPTER``
       environment variable (value = fully-qualified class name).
    3. No other files need to change.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)


class InferenceAdapter(ABC):
    """
    Protocol that any preprocessing / scoring backend must satisfy.

    The runner calls these methods in the following order:
        1. ``load()``              — idempotent; no-op after first call
        2. ``extract_metadata()``  — video metadata (fps, duration, resolution)
        3. ``sample_frames()``     — per-segment frame lists
        4. ``infer()``             — activation scores in [0, 1]
    """

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    @abstractmethod
    def load(self) -> None:
        """
        Load model weights and initialise any resources.
        Must be idempotent — the runner may call it multiple times.
        """

    @property
    @abstractmethod
    def is_loaded(self) -> bool:
        """True after the first successful ``load()`` call."""

    # ── Preprocessing ─────────────────────────────────────────────────────────

    @abstractmethod
    def extract_metadata(self, video_path: str) -> Dict:
        """
        Return a metadata dict for the video file.

        Required keys: ``fps``, ``frame_count``, ``width``, ``height``,
                       ``duration_seconds``, ``resolution``.
        """

    @abstractmethod
    def sample_frames(
        self, video_path: str, meta: Dict
    ) -> List[List[np.ndarray]]:
        """
        Sample frames for each fixed-duration segment of the video.

        Args:
            video_path: Absolute path to the video file.
            meta:       Metadata dict returned by ``extract_metadata()``.

        Returns:
            A list of segments; each segment is a list of H×W×3 uint8 RGB arrays.
        """

    # ── Scoring ───────────────────────────────────────────────────────────────

    @abstractmethod
    def infer(self, segments: List[List[np.ndarray]]) -> np.ndarray:
        """
        Predict engagement scores for every segment.

        Returns:
            np.ndarray of shape ``(n_segments,)``, dtype float64, values in [0, 1].
        """

    # ── Metadata ──────────────────────────────────────────────────────────────

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Human-readable model name, e.g. ``"tribe-v2"``."""

    @property
    @abstractmethod
    def model_version(self) -> str:
        """Semantic version string, e.g. ``"2.0.0"``."""

    @property
    @abstractmethod
    def device(self) -> str:
        """Device in use after ``load()``, e.g. ``"cuda"`` or ``"cpu"``."""


# ── Default concrete implementation ──────────────────────────────────────────


class TribeV2Adapter(InferenceAdapter):
    """
    Wraps the existing ``tribe_model.TribeV2Model`` and ``video_utils`` pipeline.

    This is the default adapter selected when ``INFERENCE_ADAPTER`` is not set.
    It supports both fine-tuned-weights mode and backbone-only proxy mode.
    """

    def __init__(
        self,
        weights_path: Optional[str] = None,
        backbone_id: str = "openai/clip-vit-base-patch32",
        device: str = "auto",
        segment_duration: float = 1.0,
        frames_per_segment: int = 8,
    ) -> None:
        self._weights_path = weights_path
        self._backbone_id = backbone_id
        self._device_cfg = device
        self._segment_duration = segment_duration
        self._frames_per_segment = frames_per_segment
        self._model = None  # lazy-loaded on first load() call

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def load(self) -> None:
        if self._model is not None:
            return  # idempotent
        from .tribe_model import get_model
        logger.info(
            "TribeV2Adapter: loading model (backbone=%s, device=%s)",
            self._backbone_id,
            self._device_cfg,
        )
        self._model = get_model(
            weights_path=self._weights_path or None,
            backbone_id=self._backbone_id,
            device=self._device_cfg,
        )
        logger.info(
            "TribeV2Adapter: model ready (device=%s, has_weights=%s)",
            self._model.device,
            self._model.has_weights,
        )

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    # ── Preprocessing ─────────────────────────────────────────────────────────

    def extract_metadata(self, video_path: str) -> Dict:
        from .video_utils import extract_video_metadata
        return extract_video_metadata(video_path)

    def sample_frames(
        self, video_path: str, meta: Dict
    ) -> List[List[np.ndarray]]:
        from .video_utils import sample_frames_for_segments
        segments, _ = sample_frames_for_segments(
            video_path,
            segment_duration=self._segment_duration,
            frames_per_segment=self._frames_per_segment,
        )
        return segments

    # ── Scoring ───────────────────────────────────────────────────────────────

    def infer(self, segments: List[List[np.ndarray]]) -> np.ndarray:
        if self._model is None:
            self.load()
        return self._model.predict_engagement(segments)

    # ── Metadata ──────────────────────────────────────────────────────────────

    @property
    def model_name(self) -> str:
        return "tribe-v2"

    @property
    def model_version(self) -> str:
        if self._model is not None and self._model.has_weights:
            return "2.0.0"
        return "2.0.0-backbone-proxy"

    @property
    def device(self) -> str:
        if self._model is not None:
            return self._model.device
        return self._device_cfg if self._device_cfg != "auto" else "cpu"


# ── Factory ───────────────────────────────────────────────────────────────────

# Module-level singleton so the adapter (and its model) is shared across jobs.
_ADAPTER_INSTANCE: Optional[InferenceAdapter] = None


def get_adapter() -> InferenceAdapter:
    """
    Return the process-wide InferenceAdapter singleton.

    Uses ``TribeV2Adapter`` by default.  To substitute a custom adapter, set
    ``INFERENCE_ADAPTER`` to the fully-qualified class name, e.g.:
        ``INFERENCE_ADAPTER=mypackage.mymodule.MyAdapter``
    The class must be importable from the Python path and subclass
    ``InferenceAdapter``.
    """
    global _ADAPTER_INSTANCE
    if _ADAPTER_INSTANCE is not None:
        return _ADAPTER_INSTANCE

    import importlib
    import os
    from apps.api.config import settings

    adapter_cls_path = os.getenv("INFERENCE_ADAPTER", "")
    if adapter_cls_path:
        module_path, cls_name = adapter_cls_path.rsplit(".", 1)
        module = importlib.import_module(module_path)
        adapter_cls = getattr(module, cls_name)
        logger.info("Loading custom adapter: %s", adapter_cls_path)
        _ADAPTER_INSTANCE = adapter_cls()
    else:
        _ADAPTER_INSTANCE = TribeV2Adapter(
            weights_path=settings.tribe_weights_path or None,
            backbone_id=settings.tribe_backbone,
            device=settings.tribe_device,
            segment_duration=settings.tribe_segment_duration,
            frames_per_segment=settings.tribe_frames_per_segment,
        )

    return _ADAPTER_INSTANCE
