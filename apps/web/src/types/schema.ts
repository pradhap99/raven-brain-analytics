// Shared TypeScript types -- mirrors packages/types/schema.py

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'
export type CognitiveLoad = 'low' | 'medium' | 'high'
export type EngagementZone = 'high' | 'medium' | 'low' | 'drop'
export type EmotionLabel = 'excitement' | 'curiosity' | 'surprise' | 'neutral' | 'boredom' | 'confusion'

export interface InputMetadata {
  filename: string
  size_bytes: number
  duration_seconds?: number
  fps?: number
  resolution?: string
  upload_url?: string
}

export interface BrainRegionActivation {
  nacc: number
  mpfc: number
  ains: number
  visual_cortex: number
  amygdala: number
}

export interface EmotionalArc {
  second: number
  valence: number
  arousal: number
  dominant_emotion: EmotionLabel
}

export interface RetentionPoint {
  second: number
  retention_pct: number
}

export interface EngagementZoneMarker {
  start_seconds: number
  end_seconds: number
  zone: EngagementZone
  label: string
  score: number
}

export interface PacingMetrics {
  avg_scene_duration: number
  scene_count: number
  visual_change_rate: number
  pacing_score: number
  rhythm_consistency: number
}

export interface BenchmarkComparison {
  category: string
  percentile: number
  avg_attention_in_category: number
  your_attention: number
  top_10_pct_threshold: number
  sample_size: number
}

export interface HookAnalysis {
  scroll_stop_probability: number
  hook_strength: number
  time_to_peak_ms: number
  first_frame_score: number
  recommendation: string
}

export interface SummaryMetrics {
  predicted_attention: number
  peak_activation: number
  peak_segment: number
  cta_strength: number
  cognitive_load: CognitiveLoad
  predicted_segments: number
  avg_valence: number
  avg_arousal: number
  predicted_retention_pct: number
  virality_score: number
  overall_grade: string
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
  brain_regions?: BrainRegionActivation
}

export interface Insight {
  type: string
  text: string
  confidence?: number
  icon?: string
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
  brain_regions_summary?: BrainRegionActivation
  emotional_arc?: EmotionalArc[]
  retention_curve?: RetentionPoint[]
  engagement_zones?: EngagementZoneMarker[]
  pacing?: PacingMetrics
  benchmark?: BenchmarkComparison
  hook_analysis?: HookAnalysis
}

export interface CreateJobRequest {
  object_key: string
  filename: string
  size_bytes: number
  sections_config?: Record<string, any>
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
