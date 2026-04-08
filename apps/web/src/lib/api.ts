import axios from 'axios'
import type {
  AnalysisResult,
  JobResponse,
  UploadSignResponse,
} from '@/types/schema'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const api = axios.create({ baseURL: BASE_URL })

// Uploads

export async function signUpload(
  filename: string,
  contentType: string,
  sizeBytes: number,
): Promise<UploadSignResponse> {
  const { data } = await api.post('/v1/uploads/sign', {
    filename,
    content_type: contentType,
    size_bytes: sizeBytes,
  })
  return data
}

export async function uploadFile(
  file: File,
  uploadUrl: string,
  objectKey: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (uploadUrl.startsWith('/')) {
    // Local dev: use multipart form upload
    const formData = new FormData()
    formData.append('file', file)
    await api.put(uploadUrl, formData, {
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    })
  } else {
    // S3 presigned URL: PUT raw file
    await axios.put(uploadUrl, file, {
      headers: { 'Content-Type': file.type },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    })
  }
}

// Jobs

export async function createJob(objectKey: string, filename: string, sizeBytes: number) {
  const { data } = await api.post<JobResponse>('/v1/analysis/jobs', {
    object_key: objectKey,
    filename,
    size_bytes: sizeBytes,
  })
  return data
}

export async function pollJob(jobId: string): Promise<JobResponse> {
  const { data } = await api.get<JobResponse>(`/v1/analysis/jobs/${jobId}`)
  return data
}

export async function getResult(jobId: string): Promise<AnalysisResult> {
  const { data } = await api.get<AnalysisResult>(`/v1/analysis/jobs/${jobId}/result`)
  return data
}
