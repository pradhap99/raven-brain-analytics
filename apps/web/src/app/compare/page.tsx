'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import { getResult } from '@/lib/api'
import type { AnalysisResult } from '@/types/schema'

const C = {
  accent: '#6C5CE7', green: '#00B894', red: '#FF6B6B', amber: '#FDCB6E',
  blue: '#74B9FF', pink: '#FD79A8', cyan: '#00CEC9',
}

const pct = (v: number | undefined | null) =>
  v != null && !isNaN(v) ? `${Math.round(v * 100)}%` : '---'

const safe = (v: number | undefined | null, fallback = 0) =>
  v != null && !isNaN(v) ? v : fallback

function CompareMetric({ label, valA, valB, icon }: { label: string; valA: string; valB: string; icon: string }) {
  return (
    <div className="bg-[#1a1a2e]/60 border border-white/5 rounded-xl p-4">
      <div className="text-xs text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <span>{icon}</span> {label}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <span className="text-xl font-bold text-purple-400">{valA}</span>
          <p className="text-[10px] text-slate-500 mt-1">Video A</p>
        </div>
        <div className="text-center">
          <span className="text-xl font-bold text-cyan-400">{valB}</span>
          <p className="text-[10px] text-slate-500 mt-1">Video B</p>
        </div>
      </div>
    </div>
  )
}

function WinnerBadge({ a, b, label }: { a: number; b: number; label: string }) {
  const winner = a > b ? 'A' : b > a ? 'B' : 'Tie'
  const color = winner === 'A' ? 'text-purple-400' : winner === 'B' ? 'text-cyan-400' : 'text-slate-400'
  return (
    <div className="flex items-center gap-2 bg-white/[0.03] rounded-lg px-3 py-2">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-xs font-bold ${color}`}>{winner === 'Tie' ? 'Tie' : `Video ${winner} wins`}</span>
    </div>
  )
}

function CompareContent() {
  const router = useRouter()
  const params = useSearchParams()
  const jobA = params.get('job_a')
  const jobB = params.get('job_b')
  const [resultA, setResultA] = useState<AnalysisResult | null>(null)
  const [resultB, setResultB] = useState<AnalysisResult | null>(null)
  const [inputA, setInputA] = useState('')
  const [inputB, setInputB] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (jobA && jobB) {
      setLoading(true)
      Promise.all([getResult(jobA), getResult(jobB)])
        .then(([a, b]) => { setResultA(a); setResultB(b) })
        .catch((e) => setError(e?.message ?? 'Failed to load results'))
        .finally(() => setLoading(false))
    }
  }, [jobA, jobB])

  const handleCompare = () => {
    if (inputA && inputB) {
      router.push(`/compare?job_a=${inputA}&job_b=${inputB}`)
    }
  }

  if (!jobA || !jobB) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] text-white">
        <header className="sticky top-0 z-50 bg-[#0d0d1a]/80 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center font-black text-sm">R</div>
              <span className="font-semibold text-sm">A/B Compare</span>
            </div>
            <button onClick={() => router.push('/upload')} className="text-slate-400 hover:text-white text-sm">Upload new</button>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-8">
          <h1 className="text-3xl font-bold">Compare Two Videos</h1>
          <p className="text-slate-400">Enter the Job IDs from two analyses to compare them side by side.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-2">Video A Job ID</label>
              <input value={inputA} onChange={(e) => setInputA(e.target.value)} placeholder="e.g. abc-123" className="w-full bg-[#1a1a2e] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-2">Video B Job ID</label>
              <input value={inputB} onChange={(e) => setInputB(e.target.value)} placeholder="e.g. def-456" className="w-full bg-[#1a1a2e] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500" />
            </div>
          </div>
          <button onClick={handleCompare} disabled={!inputA || !inputB} className="bg-gradient-to-r from-purple-600 to-cyan-600 text-white px-8 py-3 rounded-xl font-semibold disabled:opacity-40">
            Compare Now
          </button>
        </main>
      </div>
    )
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-400">Loading both analyses...</p>
      </div>
    </div>
  )

  if (error || !resultA || !resultB) return (
    <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-xl text-white">Could not load comparison</h2>
        <p className="text-slate-400">{error || 'Missing data'}</p>
        <button onClick={() => router.push('/compare')} className="bg-purple-600 text-white px-6 py-2 rounded-xl">Try again</button>
      </div>
    </div>
  )

  const a = resultA.summary
  const b = resultB.summary

  const chartA = resultA.timeline.map((pt) => ({ second: pt.second, activation: pt.activation }))
  const chartB = resultB.timeline.map((pt) => ({ second: pt.second, activation: pt.activation }))
  const mergedChart = chartA.map((pt, i) => ({ second: pt.second, videoA: pt.activation, videoB: chartB[i]?.activation ?? 0 }))

  const brA = resultA.brain_regions_summary
  const brB = resultB.brain_regions_summary
  const radarData = brA && brB ? [
    { region: 'Reward', A: safe(brA.nacc), B: safe(brB.nacc) },
    { region: 'Valuation', A: safe(brA.mpfc), B: safe(brB.mpfc) },
    { region: 'Salience', A: safe(brA.ains), B: safe(brB.ains) },
    { region: 'Visual', A: safe(brA.visual_cortex), B: safe(brB.visual_cortex) },
    { region: 'Emotion', A: safe(brA.amygdala), B: safe(brB.amygdala) },
  ] : []

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white">
      <header className="sticky top-0 z-50 bg-[#0d0d1a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center font-black text-sm">R</div>
            <span className="font-semibold text-sm">A/B Compare</span>
          </div>
          <div className="flex gap-3">
            <button onClick={() => router.push('/compare')} className="text-slate-400 hover:text-white text-sm">New comparison</button>
            <button onClick={() => router.push('/upload')} className="text-slate-400 hover:text-white text-sm">Upload</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Side-by-Side Comparison</h1>
          <div className="flex justify-center gap-4 text-sm">
            <span className="text-purple-400">A: {resultA.input?.filename || 'Video A'}</span>
            <span className="text-slate-500">vs</span>
            <span className="text-cyan-400">B: {resultB.input?.filename || 'Video B'}</span>
          </div>
        </div>

        <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <CompareMetric icon="\u{1F3C6}" label="Grade" valA={a.overall_grade || '---'} valB={b.overall_grade || '---'} />
          <CompareMetric icon="\u{1F9E0}" label="Avg Engagement" valA={pct(a.predicted_attention)} valB={pct(b.predicted_attention)} />
          <CompareMetric icon="\u26A1" label="Peak Activation" valA={pct(a.peak_activation)} valB={pct(b.peak_activation)} />
          <CompareMetric icon="\u{1F525}" label="Virality" valA={pct(a.virality_score)} valB={pct(b.virality_score)} />
          <CompareMetric icon="\u{1F504}" label="Retention" valA={pct(safe(a.predicted_retention_pct / 100))} valB={pct(safe(b.predicted_retention_pct / 100))} />
          <CompareMetric icon="\u{1F4A1}" label="CTA Strength" valA={pct(a.cta_strength)} valB={pct(b.cta_strength)} />
        </section>

        <section className="bg-[#1a1a2e]/60 border border-white/5 rounded-2xl p-4">
          <h2 className="text-sm font-semibold mb-3">Winner Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <WinnerBadge a={safe(a.predicted_attention)} b={safe(b.predicted_attention)} label="Engagement" />
            <WinnerBadge a={safe(a.peak_activation)} b={safe(b.peak_activation)} label="Peak" />
            <WinnerBadge a={safe(a.virality_score)} b={safe(b.virality_score)} label="Virality" />
            <WinnerBadge a={safe(a.predicted_retention_pct)} b={safe(b.predicted_retention_pct)} label="Retention" />
            <WinnerBadge a={safe(a.cta_strength)} b={safe(b.cta_strength)} label="CTA" />
            <WinnerBadge a={safe(a.avg_arousal)} b={safe(b.avg_arousal)} label="Arousal" />
          </div>
        </section>

        <section className="bg-[#1a1a2e]/60 border border-white/5 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Engagement Overlay</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={mergedChart}>
              <defs>
                <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accent} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.cyan} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={C.cyan} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" />
              <XAxis dataKey="second" stroke="#4a4a6a" />
              <YAxis domain={[0, 1]} stroke="#4a4a6a" tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 12, fontSize: 12 }} />
              <Area type="monotone" dataKey="videoA" stroke={C.accent} fill="url(#gA)" strokeWidth={2} name="Video A" />
              <Area type="monotone" dataKey="videoB" stroke={C.cyan} fill="url(#gB)" strokeWidth={2} name="Video B" />
            </AreaChart>
          </ResponsiveContainer>
        </section>

        {radarData.length > 0 && (
          <section className="bg-[#1a1a2e]/60 border border-white/5 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4">Brain Region Comparison</h2>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#2d2d4a" />
                <PolarAngleAxis dataKey="region" tick={{ fill: '#8a8aaa', fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
                <Radar dataKey="A" stroke={C.accent} fill={C.accent} fillOpacity={0.2} strokeWidth={2} name="Video A" />
                <Radar dataKey="B" stroke={C.cyan} fill={C.cyan} fillOpacity={0.2} strokeWidth={2} name="Video B" />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </section>
        )}

        <footer className="text-center text-[10px] text-slate-600 py-6 border-t border-white/5">
          Raven Brain Analytics - A/B Comparison
        </footer>
      </main>
    </div>
  )
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center text-slate-400">Loading...</div>}>
      <CompareContent />
    </Suspense>
  )
}
