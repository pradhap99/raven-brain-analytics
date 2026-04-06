"""
Video validation helpers.

Two layers of validation are applied:

1. **Upload-time** (in the API router): checks filename extension, declared
   MIME type, and declared file size before the bytes are written to disk.

2. **Pre-inference** (in the runner): opens the video with OpenCV to verify
   it is a decodable video file and checks the actual duration against the
   configured limit.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)

# Canonical sets used by both the API router and this module.
ALLOWED_EXTENSIONS: frozenset[str] = frozenset({".mp4", ".mov", ".avi", ".webm"})
ALLOWED_MIME_TYPES: frozenset[str] = frozenset(
    {"video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"}
)


# ── Upload-time validation ────────────────────────────────────────────────────

class UploadValidationError(ValueError):
    """Raised when an upload request fails validation."""

    def __init__(self, message: str, http_status: int = 400) -> None:
        super().__init__(message)
        self.http_status = http_status


def validate_upload_request(
    filename: str,
    content_type: str,
    size_bytes: int,
    max_size_mb: int,
    allowed_mime_types: List[str],
) -> None:
    """
    Validate an upload request before writing bytes to storage.

    Raises:
        UploadValidationError: if any constraint is violated.
    """
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise UploadValidationError(
            f"Unsupported file extension '{ext}'. "
            f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    if content_type not in allowed_mime_types:
        raise UploadValidationError(
            f"Unsupported content type '{content_type}'. "
            f"Allowed: {', '.join(sorted(allowed_mime_types))}"
        )

    max_bytes = max_size_mb * 1024 * 1024
    if size_bytes > max_bytes:
        raise UploadValidationError(
            f"File size {size_bytes / 1_048_576:.1f} MB exceeds "
            f"the maximum allowed size of {max_size_mb} MB.",
            http_status=413,
        )


# ── Pre-inference validation ──────────────────────────────────────────────────

class VideoValidationError(ValueError):
    """Raised when a video file fails pre-inference validation."""


def validate_video_file(video_path: str, max_duration_s: float) -> float:
    """
    Open the video with OpenCV and verify it is decodable and within the
    duration limit.

    Args:
        video_path:     Absolute path to the video file.
        max_duration_s: Maximum allowed duration in seconds.

    Returns:
        The actual duration in seconds.

    Raises:
        VideoValidationError: if the file cannot be opened or is too long.
    """
    try:
        import cv2
    except ImportError as exc:
        raise VideoValidationError(
            "opencv-python-headless is required for video validation. "
            "Install it with: pip install opencv-python-headless"
        ) from exc

    if not os.path.isfile(video_path):
        raise VideoValidationError(f"Video file not found: {video_path}")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        cap.release()
        raise VideoValidationError(
            f"Cannot open video file (unsupported codec or corrupt file): {video_path}"
        )

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()

    duration = frame_count / fps if fps > 0 else 0.0

    if duration <= 0:
        raise VideoValidationError(
            f"Video has zero or invalid duration: {video_path}"
        )

    if duration > max_duration_s:
        raise VideoValidationError(
            f"Video duration {duration:.1f}s exceeds maximum of {max_duration_s:.0f}s."
        )

    logger.debug("Video validated: path=%s duration=%.1fs fps=%.1f", video_path, duration, fps)
    return duration
