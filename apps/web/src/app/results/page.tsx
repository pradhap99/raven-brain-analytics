'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot, AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import { getResult } from '@/lib/api'
import type { AnalysisResult, Insight } from '@/types/schema'

const C = {
  accent: '#6C5CE7', green: '#00B894', red: '#FF6B6B', amber: '#FDCB6E',
  blue: '#74B9FF', pink: '#FD79A8', cyan: '#00CEC9', slate: '#636E72',
}

const pct = (v: number | undefined | null) =>
  v != null && !isNaN(v) ? `${Math.round(v * 100)}%` : '—'

const safe = (v: number | undefined | null, fallback = 0) =>
  v != null && !isNaN(v) ? v : fallback

function MetricCard({ icon, value, label, sub }: { icon: string; value: string; label: string; sub?: string }) {
  return (
    <div className="bg-[#1a1a2e]/60 backdrop-blur border border-white/5 rounded-2xl p-5 flex flex-col items-center text-center gap-1">
      <span className="text-2xl">{icon}</span>
      <span className="text-2xl font-bold text-white">{value}</span>
      <span className="text-xs text-slate-400 tracking-wide uppercase">{label}</span>
      {sub && <span className="text-[10px] text-slate-500 mt-1">{sub}</span>}
    </div>
  )
}

function BrainMap({ regions }: { regions: { nacc: number; mpfc: number; ains: number; visual_cortex: number; amygdala: number } | undefined }) {
  if (!regions) return null
  const areas = [
    { id: 'nacc', label: 'Nucleus Accumbens', cx: 200, cy: 195, val: regions.nacc, color: '#00B894' },
    { id: 'mpfc', label: 'Medial PFC', cx: 200, cy: 115, val: regions.mpfc, color: '#6C5CE7' },
    { id: 'ains', label: 'Anterior Insula', cx: 130, cy: 165, val: regions.ains, color: '#FDCB6E' },
    { id: 'visual', label: 'Visual Cortex', cx: 200, cy: 260, val: regions.visual_cortex, color: '#74B9FF' },
    { id: 'amygdala', label: 'Amygdala', cx: 270, cy: 165, val: regions.amygdala, color: '#FD79A8' },
  ]
  return (
    <div className="relative">
      <svg viewBox="0 0 400 340" className="w-full max-w-[400px] mx-auto">
        <ellipse cx="200" cy="180" rx="150" ry="130" fill="none" stroke="#2d2d4a" strokeWidth="2" />
        <ellipse cx="200" cy="180" rx="148" ry="128" fill="#0d0d1a" opacity="0.5" />
        <line x1="200" y1="52" x2="200" y2="308" stroke="#2d2d4a" strokeWidth="1" strokeDasharray="4 4" />
        <ellipse cx="200" cy="290" rx="60" ry="25" fill="none" stroke="#2d2d4a" strokeWidth="1" />
        {areas.map((a) => {
          const r = 14 + safe(a.val) * 18
          const opacity = 0.15 + safe(a.val) * 0.6
          return (
            <g key={a.id}>
              <circle cx={a.cx} cy={a.cy} r={r + 12} fill={a.color} opacity={0.08}>
                <animate attributeName="r" values={`${r + 8};${r + 16};${r + 8}`} dur="3s" repeatCount="indefinite" />
              </circle>
              <circle cx={a.cx} cy={a.cy} r={r} fill={a.color} opacity={opacity} />
              <text x={a.cx} y={a.cy + r + 16} textAnchor="middle" fill={a.color} fontSize="10" fontWeight="600">{a.label.split(' ')[0]}</text>
              <text x={a.cx} y={a.cy + 4} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="bold">{Math.round(safe(a.val) * 100)}%</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const INSIGHT_STYLES: Record<string, { border: string; badge: string; label: string }> = {
  primary: { border: 'border-l-purple-500', badge: 'bg-purple-500/20 text-purple-400', label: 'Key Insight' },
  weakness: { border: 'border-l-red-500', badge: 'bg-red-500/20 text-red-400', label: 'Weakness' },
  recommendation: { border: 'border-l-amber-500', badge: 'bg-amber-500/20 text-amber-400', label: 'Action' },
  hook: { border: 'border-l-cyan-500', badge: 'bg-cyan-500/20 text-cyan-400', label: 'Hook' },
  emotion: { border: 'border-l-pink-500', badge: 'bg-pink-500/20 text-pink-400', label: 'Emotion' },
  retention: { border: 'border-l-green-500', badge: 'bg-green-500/20 text-green-400', label: 'Retention' },
  general: { border: 'border-l-slate-500', badge: 'bg-slate-700 text-slate-300', label: 'Insight' },
}

function InsightCard({ insight }: { insight: Insight }) {
  const style = INSIGHT_STYLES[insight.type] ?? INSIGHT_STYLES.general
  return (
    <div className={`border-l-4 ${style.border} bg-white/[0.03] rounded-r-xl p-4`}>
      <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold ${style.badge}`}>{style.label}</span>
      <p className="text-sm text-slate-200 mt-2 leading-relaxed">{insight.text}</p>
      {insight.confidence != null && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-purple-500/60" style={{ width: `${Math.round(insight.confidence * 100)}%` }} />
          </div>
          <span className="text-[10px] text-slate-500">{Math.round(insight.confidence * 100)}%</span>
        </div>
      )}
    </div>
  )
}

function ResultsContent() {
  const router = useRouter()
  const params = useSearchParams()
  const jobId = params.get('job_id')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) { router.replace('/upload'); return }
    getResult(jobId).then(setResult).catch((e) => setError(e?.response?.data?.detail ?? e.message))
  }, [jobId, router])

  if (error) return (
    <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-xl text-white">Could not load results</h2>
        <p className="text-slate-400">{error}</p>
        <button onClick={() => router.push('/upload')} className="bg-purple-600 text-white px-6 py-2 rounded-xl">Try again</button>
      </div>
    </div>
  )

  if (!result) return (
    <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-400">Analyzing brain engagement...</p>
      </div>
    </div>
  )

  const { summary, sections, timeline, insights } = result
  const avgEng = safe(summary.predicted_attention)
  const peakAct = safe(summary.peak_activation)
  const grade = summary.overall_grade || '—'
  const retPct = safe(summary.predicted_retention_pct / 100)
  const virality = safe(summary.virality_score)
  const dropSec = sections && sections.length > 0
    ? sections.reduce((a, b) => safe(a.score) < safe(b.score) ? a : b).start_seconds
    : null

  const chartData = timeline.map((pt) => ({ second: pt.second, activation: pt.activation }))
  const peakPt = timeline[summary.peak_segment] ?? timeline[0]
  const brainRegions = result.brain_regions_summary
  const brainRadar = brainRegions ? [
    { region: 'Reward', value: safe(brainRegions.nacc) },
    { region: 'Valuation', value: safe(brainRegions.mpfc) },
    { region: 'Salience', value: safe(brainRegions.ains) },
    { region: 'Visual', value: safe(brainRegions.visual_cortex) },
    { region: 'Emotion', value: safe(brainRegions.amygdala) },
  ] : []
  const emotionData = (result.emotional_arc ?? []).map((e) => ({ second: e.second, valence: e.valence, arousal: e.arousal }))

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white">
      <header className="sticky top-0 z-50 bg-[#0d0d1a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center font-black text-sm">R</div>
            <span className="font-semibold text-sm">Raven Brain Analytics</span>
          </div>
          <button onClick={() => router.push('/upload')} className="text-slate-400 hover:text-white text-sm">← Analyze another</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <MetricCard icon="🏆" value={grade} label="Overall Grade" />
          <MetricCard icon="🧠" value={pct(avgEng)} label="Avg Engagement" sub="predicted attention" />
          <MetricCard icon="⚡" value={pct(peakAct)} label="Peak Activation" />
          <MetricCard icon="⏱️" value={dropSec != null ? `${dropSec}s` : '—'} label="Drop-off Point" />
          <MetricCard icon="🔄" value={pct(retPct)} label="Retention" sub="watch to end" />
          <MetricCard icon="🔥" value={pct(virality)} label="Virality Score" />
        </section>

        <section className="bg-[#1a1a2e]/60 backdrop-blur border border-white/5 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">🧠 Neural Engagement Timeline</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accent} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" />
              <XAxis dataKey="second" stroke="#4a4a6a" />
              <YAxis domain={[0, 1]} stroke="#4a4a6a" tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [`${Math.round(v * 100)}%`, 'Activation']} />
              <Area type="monotone" dataKey="activation" stroke={C.accent} fill="url(#engGrad)" strokeWidth={2.5} dot={false} />
              {peakPt && <ReferenceDot x={peakPt.second} y={peakPt.activation} r={6} fill={C.green} stroke="#fff" strokeWidth={2} />}
            </AreaChart>
          </ResponsiveContainer>
        </section>

        <section className="grid md:grid-cols-2 gap-6">
          {brainRegions && (
            <div className="bg-[#1a1a2e]/60 backdrop-blur border border-white/5 rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-2">🧠 Brain Activation Map</h2>
              <p className="text-xs text-slate-400 mb-4">Bigger brighter regions mean stronger activation.</p>
              <BrainMap regions={brainRegions} />
            </div>
          )}
          {brainRadar.length > 0 && (
            <div className="bg-[#1a1a2e]/60 backdrop-blur border border-white/5 rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">🔬 Brain Region Activity</h2>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={brainRadar}>
                  <PolarGrid stroke="#2d2d4a" />
                  <PolarAngleAxis dataKey="region" tick={{ fill: '#8a8aaa', fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
                  <Radar dataKey="value" stroke={C.accent} fill={C.accent} fillOpacity={0.25} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {emotionData.length > 0 && (
          <section className="bg-[#1a1a2e]/60 backdrop-blur border border-white/5 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4">💜 Emotional Arc</h2>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={emotionData}>
                <defs>
                  <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.pink} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={C.pink} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" />
                <XAxis dataKey="second" stroke="#4a4a6a" />
                <YAxis domain={[-1, 1]} stroke="#4a4a6a" />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="valence" stroke={C.pink} fill="url(#valGrad)" strokeWidth={2} />
                <Line type="monotone" dataKey="arousal" stroke={C.amber} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </section>
        )}

        {sections && sections.length > 0 && (
          <section className="bg-[#1a1a2e]/60 backdrop-blur border border-white/5 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4">⏱️ Section Breakdown</h2>
            <div className="grid gap-2">
              {sections.map((sec, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/[0.02] rounded-xl px-4 py-3">
                  <span className="text-xs text-slate-400 w-20 shrink-0">{sec.start_seconds}s – {sec.end_seconds ?? '?'}s</span>
                  <span className="text-xs font-semibold text-white flex-1">{sec.name}</span>
                  <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400" style={{ width: `${Math.round(safe(sec.score) * 100)}%` }} />
                  </div>
                  <span className="text-xs text-slate-300 w-10 text-right">{Math.round(safe(sec.score) * 100)}%</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {insights && insights.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4">💡 AI Insights</h2>
            <div className="grid gap-3">
              {insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
            </div>
          </section>
        )}

        <footer className="text-center text-[10px] text-slate-600 py-6 border-t border-white/5">
          Model: {result.model_meta?.model_name} v{result.model_meta?.model_version}
          {result.model_meta?.inference_time_ms && ` · ${Math.round(result.model_meta.inference_time_ms)}ms inference`}
          {result.input?.duration_seconds && ` · ${result.input.duration_seconds.toFixed(1)}s video`}
        </footer>
      </main>
    </div>
  )
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center text-slate-400">Loading...</div>}>
      <ResultsContent />
    </Suspense>
  )
}
