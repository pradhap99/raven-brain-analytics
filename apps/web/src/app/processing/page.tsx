'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { pollJob } from '@/lib/api'
import type { JobStatus } from '@/types/schema'

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: 'Queued — waiting for a worker…',
  processing: 'Processing — running Tribe V2 inference…',
  completed: 'Completed! Redirecting to results…',
  failed: 'Analysis failed. Please try again.',
}

const STATUS_ICONS: Record<JobStatus, string> = {
  queued: '⏳',
  processing: '🧠',
  completed: '✅',
  failed: '❌',
}

function ProcessingContent() {
  const router = useRouter()
  const params = useSearchParams()
  const jobId = params.get('job_id')

  const [status, setStatus] = useState<JobStatus>('queued')
  const [error, setError] = useState<string | null>(null)
  const [dots, setDots] = useState('')

  const poll = useCallback(async () => {
    if (!jobId) return
    try {
      const job = await pollJob(jobId)
      setStatus(job.status)
      if (job.status === 'completed') {
        setTimeout(() => router.push(`/results?job_id=${jobId}`), 800)
      } else if (job.status === 'failed') {
        setError(job.error ?? 'Unknown error')
      }
    } catch {
      setError('Could not reach the API. Is it running?')
    }
  }, [jobId, router])

  useEffect(() => {
    if (!jobId) {
      router.replace('/upload')
      return
    }
    poll()
    const interval = setInterval(() => {
      if (status !== 'completed' && status !== 'failed') {
        poll()
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [jobId, poll, router, status])

  // Animated dots
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length < 3 ? d + '.' : '')), 500)
    return () => clearInterval(t)
  }, [])

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="text-7xl mb-6 animate-pulse">{STATUS_ICONS[status]}</div>
      <h1 className="text-3xl font-extrabold text-white mb-4">
        Analyzing Your Reel{status === 'processing' ? dots : ''}
      </h1>
      <p className="text-raven-muted text-lg mb-2">{STATUS_LABELS[status]}</p>
      {jobId && (
        <p className="text-xs text-raven-border mt-2 font-mono">Job ID: {jobId}</p>
      )}
      {error && (
        <div className="mt-6 bg-red-900/20 border border-red-500/30 rounded-xl px-6 py-4 text-red-400 text-sm max-w-md text-center">
          {error}
        </div>
      )}

      {/* Progress steps */}
      <div className="mt-12 flex flex-col gap-3 w-full max-w-sm">
        {(['queued', 'processing', 'completed'] as JobStatus[]).map((s) => {
          const done =
            (s === 'queued' && (status === 'processing' || status === 'completed')) ||
            (s === 'processing' && status === 'completed') ||
            s === status
          return (
            <div
              key={s}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                s === status
                  ? 'border-raven-accent bg-raven-accent/10 text-white'
                  : done
                  ? 'border-green-500/30 bg-green-500/5 text-green-400'
                  : 'border-raven-border text-raven-muted'
              }`}
            >
              <span className="text-lg">{STATUS_ICONS[s]}</span>
              <span className="text-sm font-medium capitalize">{s}</span>
              {s === status && status !== 'completed' && status !== 'failed' && (
                <span className="ml-auto text-xs text-raven-accent">{dots}</span>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}

export default function ProcessingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-raven-muted">Loading…</div>}>
      <ProcessingContent />
    </Suspense>
  )
}
