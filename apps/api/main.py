"""
Raven Brain Analytics — FastAPI backend entry point.
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .routers import uploads, analysis
from .config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Raven Brain Analytics API")
    # Ensure the artifacts directory exists before mounting static files
    os.makedirs(settings.artifacts_dir, exist_ok=True)
    yield
    logger.info("Shutting down Raven Brain Analytics API")


app = FastAPI(
    title="Raven Brain Analytics API",
    version="1.0.0",
    description="Async video analysis powered by Meta's Tribe V2",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(uploads.router, prefix="/v1/uploads", tags=["uploads"])
app.include_router(analysis.router, prefix="/v1/analysis", tags=["analysis"])

# Serve generated artifacts (timeline PNG, summary JSON, thumbnail strip)
# at /v1/artifacts/{job_id}/{filename}
os.makedirs(settings.artifacts_dir, exist_ok=True)
app.mount(
    "/v1/artifacts",
    StaticFiles(directory=settings.artifacts_dir),
    name="artifacts",
)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
