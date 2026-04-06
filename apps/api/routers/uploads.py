"""
POST /v1/uploads/sign   — get a pre-signed upload URL
POST /v1/uploads/local  — local dev upload endpoint
"""
from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse

from packages.types import UploadSignRequest, UploadSignResponse
from ..services.storage import get_upload_url, local_path
from ..config import settings
from workers.inference.validation import (
    UploadValidationError,
    validate_upload_request,
)

router = APIRouter()

# Only allow object keys that look like "uploads/<uuid>.<ext>" with no traversal
_OBJECT_KEY_RE = re.compile(r'^uploads/[0-9a-f\-]{36}\.[a-z0-9]{2,5}$')


def _safe_dest(object_key: str) -> str:
    """
    Resolve the destination path and ensure it is inside LOCAL_UPLOAD_DIR.
    Raises HTTPException 400 if the key looks malicious.
    """
    if not _OBJECT_KEY_RE.match(object_key):
        raise HTTPException(status_code=400, detail="Invalid object key format")
    upload_dir = os.path.realpath(settings.local_upload_dir)
    dest = os.path.realpath(local_path(object_key))
    if not dest.startswith(upload_dir + os.sep) and dest != upload_dir:
        raise HTTPException(status_code=400, detail="Invalid object key")
    return dest


@router.post("/sign", response_model=UploadSignResponse)
async def sign_upload(body: UploadSignRequest) -> UploadSignResponse:
    """Return a pre-signed URL the client can PUT the video to."""
    # Validate before issuing a URL
    try:
        validate_upload_request(
            filename=body.filename,
            content_type=body.content_type,
            size_bytes=body.size_bytes,
            max_size_mb=settings.video_max_size_mb,
            allowed_mime_types=settings.video_allowed_mime_types,
        )
    except UploadValidationError as exc:
        raise HTTPException(status_code=exc.http_status, detail=str(exc)) from exc

    try:
        upload_url, object_key = get_upload_url(
            body.filename, body.content_type, body.size_bytes
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return UploadSignResponse(
        upload_url=upload_url,
        object_key=object_key,
        expires_in=900,
    )


@router.post("/local/{object_key:path}")
async def local_upload(object_key: str, file: UploadFile = File(...)) -> JSONResponse:
    """
    Local-dev only: accept a multipart upload and write to LOCAL_UPLOAD_DIR.
    In production this endpoint is replaced by direct S3 PUT.
    """
    # Validate content type and extension at upload time
    content_type = file.content_type or "application/octet-stream"
    try:
        validate_upload_request(
            filename=file.filename or object_key,
            content_type=content_type,
            size_bytes=0,  # size unknown at this point; size limit enforced at sign time
            max_size_mb=settings.video_max_size_mb,
            allowed_mime_types=settings.video_allowed_mime_types,
        )
    except UploadValidationError as exc:
        # Only raise on type/extension errors (skip size check since size_bytes=0)
        if exc.http_status != 413:
            raise HTTPException(status_code=exc.http_status, detail=str(exc)) from exc

    dest = _safe_dest(object_key)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return JSONResponse({"object_key": object_key, "path": dest})
