"""
POST /v1/uploads/sign   — get a pre-signed upload URL
POST /v1/uploads/local  — local dev upload endpoint
"""
from __future__ import annotations

import os
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse

from packages.types import UploadSignRequest, UploadSignResponse
from ..services.storage import get_upload_url, local_path
from ..config import settings

router = APIRouter()


@router.post("/sign", response_model=UploadSignResponse)
async def sign_upload(body: UploadSignRequest) -> UploadSignResponse:
    """Return a pre-signed URL the client can PUT the video to."""
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
    dest = local_path(object_key)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return JSONResponse({"object_key": object_key, "path": dest})
