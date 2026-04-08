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

const COLORS = { accent: '#6C5CE7', green: '#00B894', red: '#FF6B6B', amber: '#FDCB6E', blue: '#74B9FF', pink: '#FD79A8', cyan: '#00CEC9' }
const ZONE_COLORS: Record<string,string> = { high: '#00B894', medium: '#FDCB6E', low: '#FF6B6B', drop: '#636E72' }
const GRADE_COLORS: Record<string,string> = { A: '#00B894', B: '#FDCB6E', C: '#FF6B6B', D: '#636E72' }

function GradeRing({ grade, size = 80 }: { grade: string; size?: number }) {
  const color = GRADE_COLORS[grade] || '#636E72'
  return (
    <div className="flex flex-col items-center">
      <div className="rounded-full flex items-center justify-center font-black" style={{ width: size, height: size, border: `4px solid ${color}`, fontSize: size * 0.45, color }}>{grade}</div>
      <span className="text-xs text-slate-400 mt-1">Overall Grade</span>
    </div>
  )
}

function MetricCard({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  )
}

function ProgressBar({ value, max = 1, color = COLORS.accent, label }: { value: number; max?: number; color?: string; label?: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="w-full">
      {label && <div className="flex justify-between text-xs text-slate-400 mb-1"><span>{label}</span><span>{pct}%</span></div>}
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
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
    <div className={`bg-slate-800/60 border-l-4 ${style.border} rounded-lg px-4 py-3 my-2`}>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.badge} mr-2`}>{style.label}</span>
      <span className="text-slate-200 text-sm">{insight.text}</span>
      {insight.confidence && <span className="text-xs text-slate-500 ml-2">({Math.round(insight.confidence * 100)}%)</span>}
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

  if (error) return (<div className="min-h-screen flex items-center justify-center bg-slate-900"><div className="text-center"><h2 className="text-xl font-bold text-white mb-2">Could not load results</h2><p className="text-slate-400 mb-4">{error}</p><button onClick={() => router.push('/upload')} className="bg-purple-600 text-white px-6 py-2 rounded-xl">Try again</button></div></div>)
  if (!result) return (<div className="min-h-screen flex items-center justify-center bg-slate-900"><p className="text-slate-400">Loading results...</p></div>)

  const { summary, sections, timeline, insights } = result
  const chartData = timeline.map((pt) => ({ second: pt.second, activation: pt.activation }))
  const peakPt = timeline[summary.peak_segment] ?? timeline[0]
  const brainData = result.brain_regions_summary ? [
    { region: 'Reward', value: result.brain_regions_summary.nacc },
    { region: 'Valuation', value: result.brain_regions_summary.mpfc },
    { region: 'Salience', value: result.brain_regions_summary.ains },
    { region: 'Visual', value: result.brain_regions_summary.visual_cortex },
    { region: 'Emotion', value: result.brain_regions_summary.amygdala },
  ] : []
  const emotionData = (result.emotional_arc ?? []).map((e) => ({ second: e.second, valence: e.valence, arousal: e.arousal }))
  const retentionData = (result.retention_curve ?? []).map((r) => ({ second: r.second, retention: r.retention_pct }))
  const maxScore = sections[0]?.score ?? 1

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800/50 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold">R</div>
          <span className="font-semibold text-lg">Raven Brain Analytics</span>
        </div>
        <button onClick={() => router.push('/upload')} className="text-slate-400 hover:text-white text-sm">← Analyze another</button>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* Hero Score Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="col-span-2 md:col-span-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6 flex flex-col items-center justify-center">
            <GradeRing grade={summary.overall_grade} size={96} />
          </div>
          <MetricCard icon="🧠" value={`${Math.round(summary.avg_engagement * 100)}%`} label="Avg Engagement" />
          <MetricCard icon="⚡" value={`${Math.round(summary.peak_activation * 100)}%`} label="Peak Activation" />
          <MetricCard icon="⏱️" value={`${summary.drop_off_second ?? '—'}s`} label="Drop-off Point" />
        </div>

        {/* Engagement Timeline */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4">🧠 Neural Engagement Timeline</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="second" stroke="#64748b" tick={{ fontSize: 11 }} label={{ value: 'Second', position: 'insideBottomRight', offset: -5, fill: '#64748b', fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 1]} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={(v: number) => [`${Math.round(v * 100)}%`, 'Activation']} />
              <Area type="monotone" dataKey="activation" stroke={COLORS.accent} fill="url(#engGrad)" strokeWidth={2} />
              {peakPt && <ReferenceDot x={peakPt.second} y={peakPt.activation} r={6} fill={COLORS.amber} stroke={COLORS.amber} />}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Two col: Brain Radar + Emotion Arc */}
        <div className="grid md:grid-cols-2 gap-6">
          {brainData.length > 0 && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4">🔬 Brain Region Activity</h2>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={brainData}>
                  <PolarGrid stroke="#334155" />
                  <PolarAngleAxis dataKey="region" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 1]} tick={{ fill: '#64748b', fontSize: 9 }} />
                  <Radar dataKey="value" stroke={COLORS.cyan} fill={COLORS.cyan} fillOpacity={0.3} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
          {emotionData.length > 0 && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4">💜 Emotional Arc</h2>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={emotionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="second" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[-1, 1]} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="valence" stroke={COLORS.pink} strokeWidth={2} dot={false} name="Valence" />
                  <Line type="monotone" dataKey="arousal" stroke={COLORS.amber} strokeWidth={2} dot={false} name="Arousal" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Retention Curve */}
        {retentionData.length > 0 && (
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4">📉 Audience Retention Curve</h2>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={retentionData}>
                <defs>
                  <linearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.green} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={COLORS.green} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="second" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={(v: number) => [`${v}%`, 'Retention']} />
                <Area type="monotone" dataKey="retention" stroke={COLORS.green} fill="url(#retGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Sections Breakdown */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4">⏱️ Section Breakdown</h2>
          <div className="space-y-3">
            {sections.map((sec, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="text-slate-400 text-xs w-20 shrink-0">{sec.start_second}s – {sec.end_second}s</span>
                <div className="flex-1">
                  <ProgressBar value={sec.score} max={maxScore} color={ZONE_COLORS[sec.zone] ?? COLORS.accent} label={sec.label} />
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0`} style={{ background: (ZONE_COLORS[sec.zone] ?? COLORS.accent) + '22', color: ZONE_COLORS[sec.zone] ?? COLORS.accent }}>{sec.zone}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Insights */}
        {insights && insights.length > 0 && (
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-3">💡 AI Insights</h2>
            {insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
          </div>
        )}

      </div>
    </div>
  )
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-900"><p className="text-slate-400">Loading...</p></div>}>
      <ResultsContent />
    </Suspense>
  )
}
