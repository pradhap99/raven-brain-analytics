# 🧠 Raven Brain Analytics

Predict how brains react to your IG Reels using Meta's Tribe V2.  
Upload a video → async analysis job → rich results dashboard.

---

## Architecture

```
raven-brain-analytics/
├── apps/
│   ├── api/          # FastAPI backend
│   └── web/          # Next.js 14 frontend
├── workers/
│   └── inference/    # Python async worker (mock + real placeholder)
├── packages/
│   └── types/        # Shared Pydantic + TypeScript schemas
├── docker-compose.yml
└── .env.example
```

### Request flow

```
Browser → POST /v1/uploads/sign  → get presigned URL
       → PUT  <presigned URL>    → upload video
       → POST /v1/analysis/jobs  → create job (queued)
       → GET  /v1/analysis/jobs/{id}        → poll status
       → GET  /v1/analysis/jobs/{id}/result → fetch AnalysisResult
```

---

## Quick Start (local dev, mock mode)

### 1. Clone & configure

```bash
git clone https://github.com/pradhap99/raven-brain-analytics.git
cd raven-brain-analytics
cp .env.example .env
```

### 2. Start the API

```bash
cd apps/api
pip install -r requirements.txt
# From repo root so Python path is correct:
cd ../..
PYTHONPATH=. uvicorn apps.api.main:app --reload --port 8000
```

Open [http://localhost:8000/docs](http://localhost:8000/docs) to explore the API.

### 3. Start the web app

```bash
cd apps/web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Docker Compose (optional)

```bash
docker-compose up --build
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/uploads/sign` | Get a pre-signed upload URL |
| `POST` | `/v1/uploads/local/{key}` | Local dev upload (multipart) |
| `POST` | `/v1/analysis/jobs` | Create analysis job |
| `GET`  | `/v1/analysis/jobs/{job_id}` | Poll job status |
| `GET`  | `/v1/analysis/jobs/{job_id}/result` | Fetch full result |
| `GET`  | `/health` | Health check |

### AnalysisResult schema

```json
{
  "job_id": "uuid",
  "status": "completed",
  "input": { "filename": "...", "size_bytes": 0, "duration_seconds": 15 },
  "summary": {
    "predicted_attention": 0.62,
    "peak_activation": 0.78,
    "peak_segment": 2,
    "cta_strength": 0.55,
    "cognitive_load": "medium",
    "predicted_segments": 15
  },
  "sections": [
    { "name": "hook", "start_seconds": 0, "end_seconds": 3, "score": 0.74, "rank": 1 }
  ],
  "timeline": [
    { "segment_index": 0, "second": 0.0, "activation": 0.62 }
  ],
  "insights": [
    { "type": "primary", "text": "...", "confidence": 0.91 },
    { "type": "weakness", "text": "...", "confidence": 0.85 },
    { "type": "recommendation", "text": "...", "confidence": 0.88 }
  ],
  "model_meta": { "model_name": "mock-tribe-v2", "model_version": "0.1.0-mock" }
}
```

---

## Configuration

All options are set via environment variables. See [`.env.example`](.env.example).

| Variable | Default | Description |
|----------|---------|-------------|
| `MOCK_INFERENCE` | `true` | Use mock results instead of real model |
| `STORAGE_BACKEND` | `local` | `local` or `s3` |
| `QUEUE_BACKEND` | `memory` | `memory`, `redis`, or `sqs` |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | API base URL for the web app |

---

## Integrating the Real Model

### Overview

When `MOCK_INFERENCE=false` the API calls `workers/inference/runner.py`, which:

1. Resolves the uploaded video from local storage (or S3).
2. Extracts metadata (duration, fps, resolution) via OpenCV.
3. Splits the video into 1-second segments and samples 8 frames per segment.
4. Runs each segment through the **CLIP ViT-B/32** visual backbone (HuggingFace `openai/clip-vit-base-patch32`).
5. Applies the **Tribe V2 regression head** — a `Linear(hidden_dim, 1)` layer fine-tuned on Meta's fMRI engagement dataset — to produce per-segment activation scores.
6. Normalises scores to [0, 1], builds the timeline, section rankings, and data-driven insights.
7. Returns a fully populated `AnalysisResult`.

Without model weights (`TRIBE_WEIGHTS_PATH` left empty), the runner operates in **backbone-only proxy mode**: CLIP feature magnitudes are used as a visual-richness proxy for engagement. This produces non-trivial, content-sensitive results and lets the full pipeline run without a GPU or weights file.

### Install ML dependencies

```bash
# CPU-only (works everywhere, ~2–10s per video on a modern CPU)
pip install -r workers/inference/requirements.txt

# GPU (CUDA 12.1) — replace with the wheel matching your driver
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install -r workers/inference/requirements.txt
```

The CLIP backbone weights (~350 MB) download automatically from HuggingFace on first run and are cached at `~/.cache/huggingface/`.

### Obtain Tribe V2 model weights

The Tribe V2 regression head is a `.pt` checkpoint with the following structure:

```python
torch.save({
    "head": head.state_dict(),        # required — nn.Linear(hidden_dim, 1)
    "encoder": encoder.state_dict(),  # optional — fine-tuned CLIP encoder
    "backbone_id": "openai/clip-vit-base-patch32",
    "version": "2.0.0",
}, "tribe_v2.pt")
```

Once you have the checkpoint:

```bash
# In your .env
TRIBE_WEIGHTS_PATH=/path/to/tribe_v2.pt
MOCK_INFERENCE=false
TRIBE_DEVICE=auto   # auto-selects CUDA → MPS → CPU
```

### GPU requirements

| Mode | Minimum VRAM | Typical latency (15s reel) |
|------|-------------|---------------------------|
| CPU (backbone proxy) | N/A | ~15–45s |
| CPU (with weights) | N/A | ~15–45s |
| CUDA GPU (16-bit) | 4 GB | ~3–8s |
| CUDA GPU (32-bit) | 8 GB | ~5–12s |

For batch production use, set `TRIBE_FRAMES_PER_SEG=4` to halve memory usage with minimal accuracy loss.

### Run the smoke test

```bash
# Synthetic 5-second video (no file needed):
PYTHONPATH=. MOCK_INFERENCE=false python workers/inference/tests/test_runner.py

# Real video file:
PYTHONPATH=. MOCK_INFERENCE=false python workers/inference/tests/test_runner.py /path/to/reel.mp4
```

---

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/upload` | Drag-and-drop video upload |
| `/processing?job_id=...` | Live polling / status stepper |
| `/results?job_id=...` | Full dashboard (metrics, timeline, sections, insights) |

---

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS, Recharts
- **Backend**: FastAPI, Pydantic v2, Uvicorn
- **Worker**: Python asyncio (pluggable queue: in-memory → Redis → SQS)
- **Storage**: Local filesystem → S3 pre-signed URLs
- **Types**: Shared schema in `packages/types/` (Python + TypeScript mirror)

---

Powered by Meta TRIBE v2 • Built by Raven Labs
