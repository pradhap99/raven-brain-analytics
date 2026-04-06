"""
Video I/O utilities for Tribe V2 inference.
Wraps OpenCV to extract metadata and sample frames per segment.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)


def extract_video_metadata(video_path: str) -> Dict:
    """
    Return basic metadata for a video file.

    Raises ValueError if the file cannot be opened.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video file: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = frame_count / fps if fps > 0 else 0.0

    cap.release()

    return {
        "fps": fps,
        "frame_count": frame_count,
        "width": width,
        "height": height,
        "duration_seconds": duration,
        "resolution": f"{width}x{height}",
    }


def sample_frames_for_segments(
    video_path: str,
    segment_duration: float = 1.0,
    frames_per_segment: int = 8,
) -> Tuple[List[List[np.ndarray]], float]:
    """
    Split a video into fixed-length segments and uniformly sample frames from each.

    Args:
        video_path:           Path to the video file.
        segment_duration:     Length of each segment in seconds.
        frames_per_segment:   Number of frames to sample from each segment.

    Returns:
        (segments, duration_seconds)
        segments — list of lists; each inner list contains H×W×3 uint8 RGB frames.
        duration_seconds — total video duration.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video file: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps

    n_segments = max(1, int(np.ceil(duration / segment_duration)))
    _placeholder = np.zeros((224, 224, 3), dtype=np.uint8)

    segments: List[List[np.ndarray]] = []

    for seg_i in range(n_segments):
        seg_start_s = seg_i * segment_duration
        seg_end_s = min((seg_i + 1) * segment_duration, duration)

        start_frame = int(seg_start_s * fps)
        end_frame = min(int(seg_end_s * fps), total_frames - 1)

        if end_frame <= start_frame:
            segments.append([_placeholder.copy()])
            continue

        sample_indices = np.linspace(
            start_frame, end_frame, frames_per_segment, dtype=int
        )

        seg_frames: List[np.ndarray] = []
        for idx in sample_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
            ret, frame_bgr = cap.read()
            if ret:
                seg_frames.append(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))

        segments.append(seg_frames if seg_frames else [_placeholder.copy()])

        logger.debug("Segment %d/%d: sampled %d frames", seg_i + 1, n_segments, len(seg_frames))

    cap.release()
    return segments, duration
