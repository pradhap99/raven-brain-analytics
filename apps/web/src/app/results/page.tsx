'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot, AreaChart, Area,
  BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Cell,
} from 'recharts'
import { getResult } from '@/lib/api'
import type { AnalysisResult, Insight } from '@/types/schema'

const COLORS = {
  accent: '#6C5CE7',
  green: '#00B894',
  red: '#FF6B6B',
  amber: '#FDCB6E',
  blue: '#74B9FF',
  pink: '#FD79A8',
  cyan: '#00CEC9',
}

const ZONE_COLORS: Record<string, string> = {
  high: '#00B894',
  medium: '#FDCB6E',
  low: '#FF6B6B',
  drop: '#636E72',
}

const GRADE_COLORS: Record<string, string> = {
  A: '#00B894',
  B: '#FDCB6E',
  C: '#FF6B6B',
  D: '#636E72',
}

function GradeRing({ grade, size = 80 }: { grade: string; size?: number }) {
  const color = GRADE_COLORS[grade] || '#636E72'
  return (
    <div className="flex flex-col items-center">
      <div
        className="rounded-full flex items-center justify-center font-black"
        style={{
          width: size, height: size,
          border: `4px solid ${color}`,
          fontSize: size * 0.45,
          color,
        }}
      >
        {grade}
      </div>
      <span className="text-xs text-slate-400 mt-1">Overall Grade</span>
    </div>
  )
}

function MetricCard({ icon, value, label, sub }: { icon: string; value: string; label: string; sub?: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
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

const INSIGHT_ICONS: Record<string, string> = {
  brain: '\uD83E\uDDE0', 'alert-triangle': '\u26A0\uFE0F', zap: '\u26A1', eye: '\uD83D\uDC41',
  heart: '\u2764\uFE0F', users: '\uD83D\uDC65', 'bar-chart': '\uD83D\uDCCA',
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
  const icon = insight.icon ? INSIGHT_ICONS[insight.icon] || '\uD83D\uDCA1' : '\uD83D\uDCA1'
  return (
    <div className={`bg-slate-800/60 border-l-4 ${style.border} rounded-lg px-4 py-3 my-2`}>
      <div className="flex items-start gap-2">
        <span className="text-lg">{icon}</span>
        <div className="flex-1">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.badge} mr-2`}>{style.label}</span>
          <span className="text-slate-200 text-sm">{insight.text}</span>
          {insight.confidence && (
            <span className="text-xs text-slate-500 ml-2">({Math.round(insight.confidence * 100)}%)</span>
          )}
        </div>
      </div>
    </div>
  )

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
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <div className="text-5xl mb-4">\u274C</div>
        <h2 className="text-xl font-bold text-white mb-2">Could not load results</h2>
        <p className="text-slate-400 mb-4">{error}</p>
        <button onClick={() => router.push('/upload')} className="btn-primary">Try again</button>
      </div>
    </div>
  )

  if (!result) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <div className="animate-spin text-4xl mb-4">\uD83E\uDDE0</div>
        <p className="text-slate-400">Loading results\u2026</p>
      </div>
    </div>
  )

  const { summary, sections, timeline, insights } = result
  const chartData = timeline.map((pt) => ({ second: pt.second, activation: pt.activation }))
  const peakPt = timeline[summary.peak_segment] ?? timeline[0]

  // Brain radar data
  const brainData = result.brain_regions_summary ? [
    { region: 'Reward', value: result.brain_regions_summary.nacc },
    { region: 'Valuation', value: result.brain_regions_summary.mpfc },
    { region: 'Salience', value: result.brain_regions_summary.ains },
    { region: 'Visual', value: result.brain_regions_summary.visual_cortex },
    { region: 'Emotion', value: result.brain_regions_summary.amygdala },
  ] : []

  // Emotional arc data
  const emotionData = (result.emotional_arc ?? []).map((e) => ({
    second: e.second, valence: e.valence, arousal: e.arousal, emotion: e.dominant_emotion,
  }))

  // Retention data
  const retentionData = (result.retention_curve ?? []).map((r) => ({
    second: r.second, retention: r.retention_pct,
  }))

  const maxScore = sections[0]?.score ?? 1

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black">\uD83E\uDDE0 Brain Analytics</h1>
            <p className="text-slate-400 text-sm mt-1">
              {result.input.filename} &bull; Job {result.job_id.slice(0, 8)}&hellip; &bull; {result.model_meta.model_name}
            </p>
          </div>
          <GradeRing grade={summary.overall_grade} />
        </div>

        {/* Top Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
          <MetricCard icon="\uD83C\uDFAF" value={`${Math.round(summary.predicted_attention * 100)}%`} label="Attention" />
          <MetricCard icon="\u26A1" value={`${Math.round(summary.peak_activation * 100)}%`} label="Peak Activation" />
          <MetricCard icon="\uD83D\uDD25" value={`${Math.round(summary.virality_score * 100)}%`} label="Virality" />
          <MetricCard icon="\uD83D\uDCCA" value={`${Math.round(summary.predicted_retention_pct)}%`} label="Retention" />
          <MetricCard icon="\uD83C\uDFA3" value={`${Math.round(summary.cta_strength * 100)}%`} label="CTA Strength" />
          <MetricCard icon="\uD83E\uDDE0" value={summary.cognitive_load.toUpperCase()} label="Cognitive Load" />
        </div>

        {/* Hook Analysis */}
        {result.hook_analysis && (
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 mb-6">
            <h2 className="text-lg font-bold mb-4">\uD83C\uDFA3 Hook Analysis</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <ProgressBar value={result.hook_analysis.scroll_stop_probability} color={COLORS.cyan} label="Scroll Stop" />
              </div>
              <div>
                <ProgressBar value={result.hook_analysis.hook_strength} color={COLORS.accent} label="Hook Strength" />
              </div>
              <div>
                <ProgressBar value={result.hook_analysis.first_frame_score} color={COLORS.green} label="First Frame" />
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white">{result.hook_analysis.time_to_peak_ms}ms</div>
                <div className="text-xs text-slate-400">Time to Peak</div>
              </div>
            </div>
            <p className="text-sm text-slate-400 mt-3 italic">{result.hook_analysis.recommendation}</p>
          </div>
        )}

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

          {/* Engagement Timeline */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4">\uD83D\uDCC8 Engagement Timeline</h2>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="second" stroke="#64748B" tickFormatter={(v: number) => `${v}s`} />
                <YAxis stroke="#64748B" domain={[0, 1]} />
                <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8 }} />
                <Area type="monotone" dataKey="activation" stroke={COLORS.accent} fill="url(#actGrad)" strokeWidth={2} />
                {peakPt && <ReferenceDot x={peakPt.second} y={peakPt.activation} r={6} fill={COLORS.accent} stroke="white" />}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Brain Radar */}
          {brainData.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4">\uD83E\uDDE0 Brain Region Activation</h2>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={brainData}>
                  <PolarGrid stroke="#334155" />
                  <PolarAngleAxis dataKey="region" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
                  <Radar dataKey="value" stroke={COLORS.pink} fill={COLORS.pink} fillOpacity={0.3} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Emotional Arc */}
          {emotionData.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4">\u2764\uFE0F Emotional Arc</h2>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={emotionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="second" stroke="#64748B" tickFormatter={(v: number) => `${v}s`} />
                  <YAxis stroke="#64748B" domain={[-1, 1]} />
                  <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="valence" stroke={COLORS.pink} strokeWidth={2} dot={false} name="Valence" />
                  <Line type="monotone" dataKey="arousal" stroke={COLORS.amber} strokeWidth={2} dot={false} name="Arousal" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Retention Curve */}
          {retentionData.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4">\uD83D\uDC65 Retention Curve</h2>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={retentionData}>
                  <defs>
                    <linearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.green} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={COLORS.green} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="second" stroke="#64748B" tickFormatter={(v: number) => `${v}s`} />
                  <YAxis stroke="#64748B" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8 }} />
                  <Area type="monotone" dataKey="retention" stroke={COLORS.green} fill="url(#retGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

        </div>

        {/* Engagement Zones */}
        {result.engagement_zones && result.engagement_zones.length > 0 && (
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 mb-6">
            <h2 className="text-lg font-bold mb-4">\uD83D\uDFE2 Engagement Zones</h2>
            <div className="flex gap-1 h-10 rounded-lg overflow-hidden">
              {result.engagement_zones.map((z, i) => {
                const widthPct = ((z.end_seconds - z.start_seconds) / (result.input.duration_seconds || 15)) * 100
                return (
                  <div key={i} className="relative group" style={{ width: `${widthPct}%`, backgroundColor: ZONE_COLORS[z.zone] || '#636E72' }}>
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white/90 truncate px-1">
                      {z.label}
                    </div>
                    <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-xs text-slate-300 px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                      {z.start_seconds}s-{z.end_seconds}s ({Math.round(z.score * 100)}%)
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-4 mt-4 text-xs text-slate-400">
              {Object.entries(ZONE_COLORS).map(([k, c]) => (
                <div key={k} className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: c }} />
                  {k}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sections + Pacing + Benchmark Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

          {/* Section Ranking */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4">\uD83C\uDFC6 Section Ranking</h2>
            {sections.map((sec) => {
              const pct = Math.round((sec.score / maxScore) * 100)
              const color = sec.rank === 1 ? COLORS.green : sec.rank === sections.length ? COLORS.red : COLORS.blue
              return (
                <div key={sec.name} className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize font-medium">{sec.name}</span>
                    <span className="text-slate-400">#{sec.rank} &bull; {sec.score.toFixed(4)}</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pacing */}
          {result.pacing && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4">\u23F1\uFE0F Pacing</h2>
              <div className="space-y-3">
                <ProgressBar value={result.pacing.pacing_score} color={COLORS.cyan} label="Pacing Score" />
                <ProgressBar value={result.pacing.rhythm_consistency} color={COLORS.blue} label="Rhythm Consistency" />
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="text-center">
                    <div className="text-xl font-bold">{result.pacing.scene_count}</div>
                    <div className="text-xs text-slate-400">Scenes</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold">{result.pacing.avg_scene_duration}s</div>
                    <div className="text-xs text-slate-400">Avg Duration</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Benchmark */}
          {result.benchmark && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4">\uD83D\uDCCA Benchmark</h2>
              <div className="text-center mb-4">
                <div className="text-4xl font-black" style={{ color: result.benchmark.percentile > 70 ? COLORS.green : COLORS.amber }}>
                  P{result.benchmark.percentile}
                </div>
                <div className="text-xs text-slate-400">Percentile in {result.benchmark.category.replace(/_/g, ' ')}</div>
                <div className="text-xs text-slate-500">({result.benchmark.sample_size.toLocaleString()} reels)</div>
              </div>
              <div className="space-y-2">
                <ProgressBar value={result.benchmark.your_attention} color={COLORS.accent} label="Your Attention" />
                <ProgressBar value={result.benchmark.avg_attention_in_category} color={COLORS.blue} label="Category Avg" />
                <ProgressBar value={result.benchmark.top_10_pct_threshold} color={COLORS.green} label="Top 10% Threshold" />
              </div>
            </div>
          )}

        </div>

        {/* Insights */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold mb-4">\uD83D\uDCA1 Insights</h2>
          {insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
        </div>

        {/* Footer actions */}
        <div className="flex justify-center gap-4 py-8">
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `raven_report_${result.job_id.slice(0, 8)}.json`
              a.click()
            }}
            className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            \uD83D\uDCE5 Download Report
          </button>
          <button
            onClick={() => router.push('/upload')}
            className="border border-slate-600 hover:border-purple-500 text-slate-300 hover:text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Analyze Another Reel
          </button>
        </div>

      </div>
    </div>
  )
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">Loading\u2026</div>}>
      <ResultsContent />
    </Suspense>
  )
}
}
