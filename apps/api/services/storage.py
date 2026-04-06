"""
Storage abstraction — local filesystem or S3.
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

from ..config import settings


def get_upload_url(filename: str, content_type: str, size_bytes: int) -> tuple[str, str]:
    """
    Returns (upload_url, object_key).
    In local mode, object_key is a path under LOCAL_UPLOAD_DIR.
    In S3 mode, generates a pre-signed PUT URL.
    """
    ext = Path(filename).suffix or ".mp4"
    object_key = f"uploads/{uuid.uuid4()}{ext}"

    if settings.storage_backend == "s3":
        import boto3
        s3 = boto3.client(
            "s3",
            region_name=settings.s3_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        upload_url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.s3_bucket,
                "Key": object_key,
                "ContentType": content_type,
            },
            ExpiresIn=900,
        )
    else:
        # Local: return a placeholder URL; the actual upload goes through POST /v1/uploads/local
        os.makedirs(settings.local_upload_dir, exist_ok=True)
                upload_url = f"/v1/uploads/local/{object_key}"

    return upload_url, object_key


def local_path(object_key: str) -> str:
    return os.path.join(settings.local_upload_dir, object_key.replace("/", "_"))
