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

1. Set `MOCK_INFERENCE=false` in your `.env`.
2. Implement `workers/inference/runner.py::process_job()`.  
   The function receives `job_id`, `object_key`, `filename`, `size_bytes`, and optional `sections_config`.  
   Return a fully populated `AnalysisResult` (see `packages/types/schema.py`).
3. Port your Tribe V2 notebook logic into that function.

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

- **Frontend**: Next.js 14, React 18, Tailwind CSS, Recharts
- **Backend**: FastAPI, Pydantic v2, Uvicorn
- **Worker**: Python asyncio (pluggable queue: in-memory → Redis → SQS)
- **Storage**: Local filesystem → S3 pre-signed URLs
- **Types**: Shared schema in `packages/types/` (Python + TypeScript mirror)

---

Powered by Meta TRIBE v2 • Built by Raven Labs
