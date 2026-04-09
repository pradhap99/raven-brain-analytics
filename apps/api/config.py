"""
Configuration via environment variables (with sensible defaults for local dev).
"""
from __future__ import annotations

import os
from typing import List


class Settings:
    # CORS
    cors_origins: List[str] = os.getenv(
            "CORS_ORIGINS", "http://localhost:3000,http://localhost:3001"
    ).split(",")

    # Storage
    storage_backend: str = os.getenv("STORAGE_BACKEND", "local")  # "local" | "s3"
    local_upload_dir: str = os.getenv("LOCAL_UPLOAD_DIR", "/tmp/raven_uploads")
    s3_bucket: str = os.getenv("S3_BUCKET", "raven-uploads")
    s3_region: str = os.getenv("S3_REGION", "us-east-1")
    aws_access_key_id: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    aws_secret_access_key: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")

    # Queue
    queue_backend: str = os.getenv("QUEUE_BACKEND", "memory")  # "memory" | "redis" | "sqs"
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # Database
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./raven.db")

    # Inference worker
    mock_inference: bool = os.getenv("MOCK_INFERENCE", "false").lower() == "true"
    inference_worker_url: str = os.getenv("INFERENCE_WORKER_URL", "")

    # Tribe V2 model
    # Path to a .pt checkpoint produced by the Tribe V2 training script.
    # Leave empty to run in backbone-only proxy mode (no GPU / no weights needed).
    tribe_weights_path: str = os.getenv("TRIBE_WEIGHTS_PATH", "")
    # Device: "auto" picks CUDA -> MPS -> CPU automatically.
    tribe_device: str = os.getenv("TRIBE_DEVICE", "auto")
    # HuggingFace model ID for the CLIP visual backbone.
    tribe_backbone: str = os.getenv("TRIBE_BACKBONE", "openai/clip-vit-base-patch32")
    # Duration of each video segment fed to the model (seconds).
    tribe_segment_duration: float = float(os.getenv("TRIBE_SEGMENT_DURATION", "1.0"))
    # Number of frames uniformly sampled from each segment.
    tribe_frames_per_segment: int = int(os.getenv("TRIBE_FRAMES_PER_SEG", "8"))

    # Result artifacts
    # Directory where per-job artifact files (PNG, JSON) are written.
    artifacts_dir: str = os.getenv("ARTIFACTS_DIR", "/tmp/raven_artifacts")
    # URL prefix used to construct artifact download links.
    artifacts_base_url: str = os.getenv(
        "ARTIFACTS_BASE_URL", "http://localhost:8000/v1/artifacts"
    )

    # Upload validation
    # Maximum uploaded file size in megabytes.
    video_max_size_mb: int = int(os.getenv("VIDEO_MAX_SIZE_MB", "500"))
    # Maximum allowed video duration in seconds.
    video_max_duration_s: float = float(os.getenv("VIDEO_MAX_DURATION_S", "300"))
    # Comma-separated list of accepted MIME types.
    video_allowed_mime_types: List[str] = os.getenv(
        "VIDEO_ALLOWED_MIME_TYPES",
        "video/mp4,video/quicktime,video/x-msvideo,video/webm,image/jpeg,image/png,image/gif,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ).split(",")

settings = Settings()
