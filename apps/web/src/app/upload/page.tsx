'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { signUpload, uploadFile, createJob } from '@/lib/api'

export default function UploadPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const handleFile = (f: File) => {
    if (!f.type.startsWith('video/')) {
      setError('Please upload a video file (MP4, MOV, etc.)')
      return
    }
    setFile(f)
    setError(null)
  }

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault()

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const handleAnalyze = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      // 1. Get presigned URL
      const { upload_url, object_key } = await signUpload(
        file.name,
        file.type || 'video/mp4',
        file.size,
      )

      // 2. Upload the file
      await uploadFile(file, upload_url, object_key, setProgress)

      // 3. Create analysis job
      const job = await createJob(object_key, file.name, file.size)

      // 4. Navigate to processing page
      router.push(`/processing?job_id=${job.job_id}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setError(msg)
      setUploading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-20">
      <h1 className="text-3xl font-extrabold text-white mb-2">Upload Your Reel</h1>
      <p className="text-raven-muted mb-10">Supported formats: MP4, MOV, AVI, WebM</p>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => inputRef.current?.click()}
        className="w-full max-w-xl border-2 border-dashed border-raven-border rounded-2xl p-16 text-center cursor-pointer hover:border-raven-accent transition-colors"
      >
        {file ? (
          <div>
            <div className="text-4xl mb-3">🎬</div>
            <p className="font-semibold text-white">{file.name}</p>
            <p className="text-raven-muted text-sm mt-1">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        ) : (
          <div>
            <div className="text-5xl mb-4">📂</div>
            <p className="text-white font-semibold">Drag & drop your video here</p>
            <p className="text-raven-muted text-sm mt-2">or click to browse</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          onChange={onInputChange}
          className="hidden"
        />
      </div>

      {/* Progress bar */}
      {uploading && (
        <div className="w-full max-w-xl mt-6">
          <div className="flex justify-between text-sm text-raven-muted mb-2">
            <span>Uploading…</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-raven-border rounded-full h-2">
            <div
              className="bg-gradient-to-r from-raven-accent to-raven-pink h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 text-red-400 text-sm">{error}</p>
      )}

      <button
        onClick={handleAnalyze}
        disabled={!file || uploading}
        className="btn-primary mt-8 text-base"
      >
        {uploading ? 'Uploading…' : '🚀 Analyze Brain Engagement'}
      </button>
    </main>
  )
}
