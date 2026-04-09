"""
Tribe V2 engagement model.

Architecture
------------
Backbone : CLIP ViT vision encoder (openai/clip-vit-base-patch32 by default).
           CLIP's visual features correlate well with neural responses to natural stimuli,
           matching the intuition behind Meta's fMRI-supervised TRIBE training.

Head     : nn.Linear(hidden_dim, 1) - maps pooled visual features to a raw engagement score.

Two modes
---------
1. **With weights** (``TRIBE_WEIGHTS_PATH`` points to a .pt checkpoint):
     Loads the fine-tuned encoder and/or regression head and runs full inference.
     Expected checkpoint keys: ``"head"`` (state dict) and optionally ``"encoder"``.

2. **Backbone-only** (no checkpoint - for development / demonstration):
     Uses the change rate of CLIP feature vectors across segments as an engagement proxy.
     Perceptually distinct segments produce large feature deltas -> higher activation.
     Scores are min-max normalised to [0, 1] across the full video.
"""
from __future__ import annotations

import logging
import os
from typing import List, Optional

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from transformers import CLIPImageProcessor, CLIPVisionModel

logger = logging.getLogger(__name__)

# Module-level singleton so the model is loaded once per process.
_MODEL_INSTANCE: Optional["TribeV2Model"] = None


class TribeV2Model:
  """CLIP-backed Tribe V2 engagement predictor."""

  def __init__(
    self,
    weights_path: Optional[str] = None,
    backbone_id: str = "openai/clip-vit-base-patch32",
    device: str = "auto",
  ) -> None:
    # -- Device selection
    if device == "auto":
      if torch.cuda.is_available():
        self._device = "cuda"
      else:
        self._device = "cpu"
    else:
      self._device = device
    logger.info("TribeV2Model: using device=%s", self._device)

    # -- Backbone (load on CPU first, then move to device)
    logger.info("Loading CLIP backbone: %s", backbone_id)
    self._processor = CLIPImageProcessor.from_pretrained(backbone_id)
    # Load on CPU first to avoid MPS meta tensor issues
    self._encoder = CLIPVisionModel.from_pretrained(
      backbone_id,
      torch_dtype=torch.float32,
    )
        # Move to target device
    if self._device != "cpu":
      self._encoder = self._encoder.to(self._device)
    self._encoder.eval()
    hidden_dim: int = self._encoder.config.hidden_size

    # -- Regression head
    self._head = nn.Linear(hidden_dim, 1)
    self._has_weights = False

    if weights_path and os.path.isfile(weights_path):
      logger.info("Loading Tribe V2 weights from: %s", weights_path)
      ckpt = torch.load(weights_path, map_location="cpu", weights_only=True)
      if "head" in ckpt:
        self._head.load_state_dict(ckpt["head"])
        self._has_weights = True
        logger.info("Tribe V2 regression head loaded.")
      else:
        logger.warning(
          "Checkpoint has no 'head' key; using backbone-only mode. "
          "Expected keys: 'head' (required), 'encoder' (optional)."
        )
      if "encoder" in ckpt:
        self._encoder.load_state_dict(ckpt["encoder"])
        logger.info("Fine-tuned encoder loaded from checkpoint.")
    elif weights_path:
      logger.warning(
        "TRIBE_WEIGHTS_PATH='%s' does not exist. "
        "Running in backbone-only (proxy) mode.",
        weights_path,
      )

    self._head.to(self._device)
    self._head.eval()

    if not self._has_weights:
      logger.info(
        "No Tribe V2 weights loaded - using CLIP feature-change proxy for engagement scores."
      )

  # -- Encoding
  @torch.no_grad()
  def _encode_frames(self, frames: List[np.ndarray]) -> np.ndarray:
    """
    Encode a list of RGB numpy frames through the CLIP vision encoder.
    Returns the mean pooled CLS-token feature vector (shape: [hidden_dim]).
    """
    pil_images = [Image.fromarray(f) for f in frames]
    inputs = self._processor(images=pil_images, return_tensors="pt")
    inputs = {k: v.to(self._device) for k, v in inputs.items()}
    outputs = self._encoder(**inputs)
    # pooler_output: [n_frames, hidden_dim] -> mean across frames
    pooled = outputs.pooler_output.mean(dim=0).cpu().numpy()  # [hidden_dim]
    return pooled

  # -- Per-segment score
  def _score_segment(self, frames: List[np.ndarray]) -> float:
    """Return a raw (un-normalised) engagement score for one segment."""
    feat = self._encode_frames(frames)  # [hidden_dim]
    if self._has_weights:
      x = torch.tensor(feat, dtype=torch.float32, device=self._device).unsqueeze(0)
      raw = self._head(x).squeeze().item()
      return float(raw)
    else:
      # Proxy: L2 norm of the feature vector correlates with visual richness
      return float(np.linalg.norm(feat))

  # -- Full-video prediction
  def predict_engagement(self, segments: List[List[np.ndarray]]) -> np.ndarray:
    """
    Predict engagement for every segment and return scores in [0, 1].

    For fine-tuned weights: sigmoid(head(features)) per segment.
    For backbone-only proxy: min-max normalised L2 feature norms.

    Args:
      segments: list of frame lists, one list per video segment.

    Returns:
      np.ndarray of shape (n_segments,), dtype float64, values in [0, 1].
    """
    raw_scores = np.array(
      [self._score_segment(seg) for seg in segments], dtype=np.float64
    )
    if self._has_weights:
      # Sigmoid maps raw regression output to [0, 1]
      activated = 1.0 / (1.0 + np.exp(-raw_scores))
    else:
      # Min-max normalise proxy scores
      lo, hi = raw_scores.min(), raw_scores.max()
      if hi > lo:
        activated = (raw_scores - lo) / (hi - lo)
      else:
        activated = np.full_like(raw_scores, 0.5)
    return np.clip(activated, 0.0, 1.0)

  @property
  def device(self) -> str:
    return self._device

  @property
  def has_weights(self) -> bool:
    return self._has_weights


# -- Singleton accessor
def get_model(
  weights_path: Optional[str] = None,
  backbone_id: str = "openai/clip-vit-base-patch32",
  device: str = "auto",
) -> TribeV2Model:
  """
  Return the module-level TribeV2Model singleton, creating it on first call.
  Subsequent calls with different arguments are ignored (model is already loaded).
  """
  global _MODEL_INSTANCE
  if _MODEL_INSTANCE is None:
    _MODEL_INSTANCE = TribeV2Model(
      weights_path=weights_path,
      backbone_id=backbone_id,
      device=device,
    )
  return _MODEL_INSTANCE
