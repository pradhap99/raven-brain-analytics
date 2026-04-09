'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { getResult } from '@/lib/api'
import type { AnalysisResult } from '@/types/schema'

const C = {
  accent: '#6C5CE7', green: '#00B894', red: '#FF6B6B', amber: '#FDCB6E',
  cyan: '#00CEC9', pink: '#FD79A8',
}

const safe = (v: number | undefined | null, fallback = 0) =>
  v != null && !isNaN(v) ? v : fallback

function ScoreRing({ value, label, color, size = 120 }: { value: number; label: string; color: string; size?: number }) {
  const r = (size - 16) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - safe(value))
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e1e3a" strokeWidth="8" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} transform={`rotate(-90 ${size/2} ${size/2})`} />
        <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="20" fontWeight="bold">{Math.round(safe(value) * 100)}%</text>
      </svg>
      <span className="text-xs text-slate-400 uppercase tracking-wider">{label}</span>
    </div>
  )
}

function GradeLabel({ score }: { score: number }) {
  const s = safe(score)
  const grade = s >= 0.8 ? 'A' : s >= 0.6 ? 'B' : s >= 0.4 ? 'C' : s >= 0.2 ? 'D' : 'F'
  const color = s >= 0.8 ? 'text-green-400' : s >= 0.6 ? 'text-blue-400' : s >= 0.4 ? 'text-amber-400' : 'text-red-400'
  return <span className={`text-4xl font-black ${color}`}>{grade}</span>
}

function HookContent() {
  const router = useRouter()
  const params = useSearchParams()
  const jobId = params.get('job_id')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inputId, setInputId] = useState('')

  useEffect(() => {
    if (jobId) {
      getResult(jobId).then(setResult).catch((e) => setError(e?.message ?? 'Failed'))
    }
  }, [jobId])

  const handleAnalyze = () => {
    if (inputId) router.push(`/hook-optimizer?job_id=${inputId}`)
  }

  if (!jobId) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] text-white">
        <header className="sticky top-0 z-50 bg-[#0d0d1a]/80 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center font-black text-sm">R</div>
              <span className="font-semibold text-sm">Hook Optimizer</span>
            </div>
            <button onClick={() => router.push('/upload')} className="text-slate-400 hover:text-white text-sm">Upload new</button>
          </div>
        </header>
        <main className="max-w-xl mx-auto px-4 py-16 text-center space-y-8">
          <h1 className="text-3xl font-bold">Hook Optimizer</h1>
          <p className="text-slate-400">Analyze your first 3 seconds. Enter a Job ID to get detailed hook analysis.</p>
          <div className="flex gap-3">
            <input value={inputId} onChange={(e) => setInputId(e.target.value)} placeholder="Enter Job ID" className="flex-1 bg-[#1a1a2e] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500" />
            <button onClick={handleAnalyze} disabled={!inputId} className="bg-cyan-600 text-white px-6 py-3 rounded-xl font-semibold disabled:opacity-40">Analyze</button>
          </div>
        </main>
      </div>
    )
  }

  if (!result) return (
    <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center text-white">
      <div className="text-center space-y-4">
        <p className="text-red-400">{error}</p>
        <button onClick={() => router.push('/hook-optimizer')} className="bg-cyan-600 text-white px-6 py-2 rounded-xl">Try again</button>
      </div>
    </div>
  )

  const hook = result.hook_analysis
  const sections = result.sections || []
  const hookSection = sections.find(s => s.name?.toLowerCase().includes('hook'))
  const first3 = result.timeline.filter(t => t.second <= 3)
  const hookScore = hook?.hook_strength ?? (hookSection?.score ?? (first3.length > 0 ? first3.reduce((sum, t) => sum + t.activation, 0) / first3.length : 0))

  const barData = [
    { name: 'Scroll Stop', value: safe(hook?.scroll_stop_probability, hookScore * 0.9), color: C.cyan },
    { name: 'Hook Strength', value: safe(hook?.hook_strength, hookScore), color: C.accent },
    { name: 'First Frame', value: safe(hook?.first_frame_score, hookScore * 0.85), color: C.green },
    { name: 'Peak Speed', value: safe(hook?.time_to_peak_ms ? Math.min(1, 2000 / hook.time_to_peak_ms) : 0, hookScore * 0.7), color: C.amber },
  ]

  const tips = [
    hook?.recommendation,
    hookScore < 0.7 ? 'Try starting with motion or a face close-up in the first frame.' : null,
    hookScore < 0.5 ? 'Add text overlay in the first second to boost scroll-stop rate.' : null,
    hookScore >= 0.7 ? 'Strong hook! Consider A/B testing slight variations.' : null,
    safe(hook?.scroll_stop_probability) < 0.5 ? 'Low scroll-stop probability. Use brighter colors or surprising visuals.' : null,
  ].filter(Boolean)

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white">
      <header className="sticky top-0 z-50 bg-[#0d0d1a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center font-black text-sm">R</div>
            <span className="font-semibold text-sm">Hook Optimizer</span>
          </div>
          <div className="flex gap-3">
            <button onClick={() => router.push(`/results?job_id=${jobId}`)} className="text-slate-400 hover:text-white text-sm">Full Results</button>
            <button onClick={() => router.push('/hook-optimizer')} className="text-slate-400 hover:text-white text-sm">New Analysis</button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <section className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Hook Analysis</h1>
          <p className="text-sm text-slate-400">{result.input?.filename || 'Video'}</p>
          <div className="flex justify-center gap-8">
            <ScoreRing value={hookScore} label="Hook Score" color={C.cyan} size={140} />
            <div className="flex flex-col items-center justify-center">
              <GradeLabel score={hookScore} />
              <span className="text-xs text-slate-400 mt-2">Hook Grade</span>
            </div>
            <ScoreRing value={safe(hook?.scroll_stop_probability, hookScore * 0.9)} label="Scroll Stop" color={C.accent} size={140} />
          </div>
        </section>

        <section className="bg-[#1a1a2e]/60 border border-white/5 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Hook Metrics Breakdown</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" />
              <XAxis type="number" domain={[0, 1]} stroke="#4a4a6a" tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
              <YAxis type="category" dataKey="name" stroke="#4a4a6a" width={100} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [`${Math.round(v * 100)}%`]} />
              <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        {tips.length > 0 && (
          <section className="bg-[#1a1a2e]/60 border border-white/5 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4">Optimization Tips</h2>
            <div className="space-y-3">
              {tips.map((tip, i) => (
                <div key={i} className="flex gap-3 items-start bg-white/[0.02] rounded-xl p-4">
                  <span className="text-cyan-400 text-lg">*</span>
                  <p className="text-sm text-slate-300">{tip}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {hook?.time_to_peak_ms && (
          <section className="bg-[#1a1a2e]/60 border border-white/5 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4">Timing</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-cyan-400">{Math.round(hook.time_to_peak_ms)}ms</p>
                <p className="text-xs text-slate-400 mt-1">Time to Peak</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-400">{Math.round(safe(hook.first_frame_score) * 100)}%</p>
                <p className="text-xs text-slate-400 mt-1">First Frame</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">{Math.round(safe(hook.scroll_stop_probability) * 100)}%</p>
                <p className="text-xs text-slate-400 mt-1">Scroll Stop</p>
              </div>
            </div>
          </section>
        )}

        <footer className="text-center text-[10px] text-slate-600 py-6 border-t border-white/5">
          Raven Brain Analytics - Hook Optimizer
        </footer>
      </main>
    </div>
  )
}

export default function HookOptimizerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center text-slate-400">Loading...</div>}>
      <HookContent />
    </Suspense>
  )
}
