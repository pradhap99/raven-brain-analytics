# 🧠 Raven Brain Analytics

Predict how brains react to your IG Reels using Meta's Tribe V2.  
Upload a video → async analysis job → rich results dashboard.

---

## Architecture

```
raven-brain-analytics/
├── apps/
│   ├── api/          # FastAPI backend
│   └── web/          # Next.js 15 frontend
├── workers/
│   └── inference/    # Python async worker
│       ├── adapter.py      # InferenceAdapter ABC + TribeV2Adapter
│       ├── artifacts.py    # Timeline PNG / summary JSON / thumbnail strip
│       ├── mock_runner.py  # Deterministic mock (MOCK_INFERENCE=true)
│       ├── runner.py       # Real inference pipeline (MOCK_INFERENCE=false)
│       ├── tribe_model.py  # CLIP backbone + Tribe V2 regression head
│       ├── validation.py   # Video file / upload validation
│       └── video_utils.py  # OpenCV frame extraction
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
| `ARTIFACTS_DIR` | `/tmp/raven_artifacts` | Directory for per-job artifact files |
| `ARTIFACTS_BASE_URL` | `http://localhost:8000/v1/artifacts` | URL prefix for artifact download links |
| `VIDEO_MAX_SIZE_MB` | `500` | Upload size limit in MB |
| `VIDEO_MAX_DURATION_S` | `300` | Video duration limit in seconds |
| `VIDEO_ALLOWED_MIME_TYPES` | `video/mp4,...` | Comma-separated accepted MIME types |
| `INFERENCE_ADAPTER` | _(empty)_ | Optional fully-qualified `InferenceAdapter` class name |

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

## Local Real Inference Run (step-by-step walkthrough)

This section shows how to run the full pipeline end-to-end on your local machine
without Docker, including artifact generation.

### Prerequisites

```bash
# 1. Install API + ML dependencies
pip install -r apps/api/requirements.txt
pip install -r workers/inference/requirements.txt
```

> **GPU users:** replace the `torch` install with the CUDA-matched wheel first:
> ```bash
> pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
> ```

### Step 1 — Configure

```bash
cp .env.example .env
```

Edit `.env`:

```dotenv
MOCK_INFERENCE=false
TRIBE_WEIGHTS_PATH=            # leave empty for backbone-only proxy mode
TRIBE_DEVICE=auto              # or "cuda" / "cpu" / "mps"
ARTIFACTS_DIR=/tmp/raven_artifacts
ARTIFACTS_BASE_URL=http://localhost:8000/v1/artifacts
VIDEO_MAX_DURATION_S=300
```

### Step 2 — Start the API

```bash
# From the repo root (PYTHONPATH=. is required so shared packages are importable)
PYTHONPATH=. uvicorn apps.api.main:app --reload --port 8000
```

The API is ready at [http://localhost:8000/docs](http://localhost:8000/docs).

### Step 3 — Upload a video

```bash
# Get a pre-signed upload URL (also validates MIME type and size)
curl -s -X POST http://localhost:8000/v1/uploads/sign \
  -H "Content-Type: application/json" \
  -d '{"filename":"reel.mp4","content_type":"video/mp4","size_bytes":5000000}' \
  | tee /tmp/sign_response.json

# Extract the object_key
OBJECT_KEY=$(jq -r '.object_key' /tmp/sign_response.json)

# Upload via the local endpoint
curl -s -X POST "http://localhost:8000/v1/uploads/local/${OBJECT_KEY}" \
  -F "file=@/path/to/your/reel.mp4"
```

### Step 4 — Submit an analysis job

```bash
JOB_RESPONSE=$(curl -s -X POST http://localhost:8000/v1/analysis/jobs \
  -H "Content-Type: application/json" \
  -d "{\"object_key\":\"${OBJECT_KEY}\",\"filename\":\"reel.mp4\",\"size_bytes\":5000000}")

JOB_ID=$(echo "$JOB_RESPONSE" | jq -r '.job_id')
echo "Job ID: $JOB_ID"
```

### Step 5 — Poll until complete

```bash
while true; do
  STATUS=$(curl -s "http://localhost:8000/v1/analysis/jobs/${JOB_ID}" | jq -r '.status')
  echo "Status: $STATUS"
  [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]] && break
  sleep 2
done
```

### Step 6 — Fetch the result

```bash
curl -s "http://localhost:8000/v1/analysis/jobs/${JOB_ID}/result" | jq .
```

The result includes:
- `summary` — attention score, peak activation, cognitive load, CTA strength
- `timeline` — per-second activation scores
- `sections` — ranked section scores (hook, intro, main, CTA)
- `insights` — primary, weakness, recommendation, and general insights
- `artifacts` — download URLs for `timeline.png`, `summary.json`, and (if available) `thumbnails.png`

### Step 7 — Download artifacts

```bash
# Timeline PNG
curl -o /tmp/timeline.png \
  "http://localhost:8000/v1/artifacts/${JOB_ID}/timeline.png"

# Summary JSON
curl -o /tmp/summary.json \
  "http://localhost:8000/v1/artifacts/${JOB_ID}/summary.json"
```

### Structured timing log

Every job emits a `job.complete` log line with per-phase timing, e.g.:

```
INFO  job.complete job_id=... timing={'model_load_ms': 3200.0, 'video_decode_ms': 45.1,
      'frame_sampling_ms': 1230.4, 'inference_ms': 8450.2, 'serialize_ms': 2.1,
      'artifact_gen_ms': 310.5, 'total_ms': 13240.3} segments=15 attention=0.6123
```

### Run the integration tests

```bash
# Skipped automatically if torch / cv2 / transformers are not installed:
PYTHONPATH=. pytest workers/inference/tests/test_integration.py -v

# With a real video:
PYTHONPATH=. REAL_VIDEO=/path/to/reel.mp4 \
  pytest workers/inference/tests/test_integration.py -v -s

# With GPU weights:
PYTHONPATH=. TRIBE_WEIGHTS_PATH=/path/to/tribe_v2.pt \
  pytest workers/inference/tests/test_integration.py -v
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
