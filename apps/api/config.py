"""
Configuration via environment variables (with sensible defaults for local dev).
"""
from __future__ import annotations

import os
from typing import List


class Settings:
    # CORS
    cors_origins: List[str] = os.getenv(
        "CORS_ORIGINS", "http://localhost:3000"
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
    mock_inference: bool = os.getenv("MOCK_INFERENCE", "true").lower() == "true"
    inference_worker_url: str = os.getenv("INFERENCE_WORKER_URL", "")


settings = Settings()
