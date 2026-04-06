// Shared TypeScript types — mirrors packages/types/schema.py

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export type CognitiveLoad = 'low' | 'medium' | 'high'

export interface InputMetadata {
  filename: string
  size_bytes: number
  duration_seconds?: number
  fps?: number
  resolution?: string
  upload_url?: string
}

export interface SummaryMetrics {
  predicted_attention: number
  peak_activation: number
  peak_segment: number
  cta_strength: number
  cognitive_load: CognitiveLoad
  predicted_segments: number
}

export interface SectionScore {
  name: string
  start_seconds: number
  end_seconds?: number
  score: number
  rank: number
}

export interface TimelinePoint {
  segment_index: number
  second: number
  activation: number
}

export interface Insight {
  type: 'primary' | 'weakness' | 'recommendation' | 'general'
  text: string
  confidence?: number
}

export interface Artifact {
  name: string
  url: string
  mime_type: string
}

export interface ModelMetadata {
  model_name: string
  model_version: string
  inference_time_ms?: number
  device?: string
}

export interface AnalysisResult {
  job_id: string
  status: JobStatus
  input: InputMetadata
  summary: SummaryMetrics
  sections: SectionScore[]
  timeline: TimelinePoint[]
  insights: Insight[]
  artifacts: Artifact[]
  model_meta: ModelMetadata
  created_at: string
  completed_at?: string
}

export interface JobResponse {
  job_id: string
  status: JobStatus
  created_at: string
  updated_at: string
  result_url?: string
  error?: string
}

export interface UploadSignResponse {
  upload_url: string
  object_key: string
  expires_in: number
}
