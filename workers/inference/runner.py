"""
Real inference runner placeholder.
Port the Tribe V2 notebook logic here when the model is ready.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from packages.types import AnalysisResult


async def process_job(
    job_id: str,
    object_key: str,
    filename: str,
    size_bytes: int,
    sections_config: Optional[Dict[str, Any]] = None,
) -> AnalysisResult:
    """
    TODO: Replace with real Tribe V2 inference.

    Steps to implement:
    1. Download the video from storage (object_key).
    2. Extract frames at the required FPS.
    3. Run the Tribe V2 encoder to get per-frame embeddings.
    4. Compute fMRI-proxy activations from the embeddings.
    5. Aggregate into timeline, sections, and summary metrics.
    6. Generate insight strings from the activation patterns.
    7. Return a fully populated AnalysisResult.
    """
    raise NotImplementedError(
        "Real inference not yet implemented. Set MOCK_INFERENCE=true to use mock results."
    )
