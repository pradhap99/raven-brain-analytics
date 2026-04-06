'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts'
import { getResult } from '@/lib/api'
import type { AnalysisResult, Insight } from '@/types/schema'

// ── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="metric-card">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  )
}

// ── Insight Card ──────────────────────────────────────────────────────────────

const INSIGHT_STYLES: Record<string, { border: string; badge: string; label: string }> = {
  primary: { border: 'border-l-raven-accent', badge: 'bg-raven-accent/20 text-raven-accent', label: 'Primary Insight' },
  weakness: { border: 'border-l-red-500', badge: 'bg-red-500/20 text-red-400', label: 'Weakness' },
  recommendation: { border: 'border-l-amber-500', badge: 'bg-amber-500/20 text-amber-400', label: 'Recommendation' },
  general: { border: 'border-l-slate-400', badge: 'bg-slate-700 text-slate-300', label: 'Insight' },
}

function InsightCard({ insight }: { insight: Insight }) {
  const style = INSIGHT_STYLES[insight.type] ?? INSIGHT_STYLES.general
  return (
    <div className={`bg-raven-surface border-l-4 ${style.border} rounded-lg px-5 py-4 my-2`}>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.badge} mr-2`}>
        {style.label}
      </span>
      <span className="text-slate-300 text-sm">{insight.text}</span>
      {insight.confidence && (
        <span className="ml-2 text-xs text-raven-muted">({Math.round(insight.confidence * 100)}% confidence)</span>
      )}
    </div>
  )
}

// ── Section Bar ───────────────────────────────────────────────────────────────

function SectionBar({
  name,
  score,
  maxScore,
  rank,
  total,
}: {
  name: string
  score: number
  maxScore: number
  rank: number
  total: number
}) {
  const pct = Math.round((score / maxScore) * 100)
  const isBest = rank === 1
  const isWorst = rank === total
  return (
    <div className="my-3">
      <div className="flex justify-between items-center mb-1">
        <span className="font-semibold text-white capitalize">{name}</span>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full border ${
            isBest
              ? 'bg-green-500/15 text-green-400 border-green-500/30'
              : isWorst
              ? 'bg-red-500/15 text-red-400 border-red-500/30'
              : 'bg-slate-700/50 text-slate-300 border-slate-600'
          }`}
        >
          {score.toFixed(4)}
        </span>
      </div>
      <div className="bg-raven-border rounded-full h-2">
        <div
          className="bg-gradient-to-r from-raven-accent to-raven-pink h-2 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Main Results Page ─────────────────────────────────────────────────────────

function ResultsContent() {
  const router = useRouter()
  const params = useSearchParams()
  const jobId = params.get('job_id')

  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) {
      router.replace('/upload')
      return
    }
    getResult(jobId)
      .then(setResult)
      .catch((e) => setError(e?.response?.data?.detail ?? e.message))
  }, [jobId, router])

  if (error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="text-5xl mb-4">❌</div>
        <h2 className="text-2xl font-bold text-white mb-2">Could not load results</h2>
        <p className="text-raven-muted mb-6">{error}</p>
        <button className="btn-primary" onClick={() => router.push('/upload')}>
          Try again
        </button>
      </main>
    )
  }

  if (!result) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-raven-muted text-lg animate-pulse">Loading results…</div>
      </main>
    )
  }

  const { summary, sections, timeline, insights } = result
  const maxScore = sections[0]?.score ?? 1

  const chartData = timeline.map((pt) => ({
    second: pt.second,
    activation: pt.activation,
  }))
  const peakPt = timeline[summary.peak_segment] ?? timeline[0]

  const primaryInsight = insights.find((i) => i.type === 'primary')
  const weaknessInsight = insights.find((i) => i.type === 'weakness')
  const recInsight = insights.find((i) => i.type === 'recommendation')
  const otherInsights = insights.filter(
    (i) => !['primary', 'weakness', 'recommendation'].includes(i.type),
  )

  return (
    <main className="min-h-screen px-4 py-12 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-raven-accent via-raven-pink to-raven-amber bg-clip-text text-transparent">
          📊 Brain Engagement Dashboard
        </h1>
        <p className="text-raven-muted mt-2 text-sm">
          {result.input.filename} &nbsp;•&nbsp; Job {result.job_id.slice(0, 8)}… &nbsp;•&nbsp;{' '}
          {result.model_meta.model_name} v{result.model_meta.model_version}
        </p>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        <MetricCard icon="🎯" value={summary.predicted_attention.toFixed(4)} label="Attention Score" />
        <MetricCard icon="⚡" value={summary.peak_activation.toFixed(4)} label="Peak Activation" />
        <MetricCard icon="📍" value={String(summary.peak_segment)} label="Peak Segment" />
        <MetricCard icon="💪" value={summary.cta_strength.toFixed(4)} label="CTA Strength" />
        <MetricCard icon="🧩" value={summary.cognitive_load} label="Cognitive Load" />
        <MetricCard icon="📐" value={String(summary.predicted_segments)} label="Segments" />
      </div>

      {/* Timeline + Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        {/* Timeline chart */}
        <div className="lg:col-span-2 bg-raven-surface border border-raven-border rounded-2xl p-6">
          <h2 className="font-semibold text-white mb-4">📈 Engagement Timeline</h2>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="second"
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                label={{ value: 'Second', position: 'insideBottomRight', fill: '#94a3b8', fontSize: 11 }}
              />
              <YAxis
                domain={[0, 1]}
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#6366f1' }}
                formatter={(v: number) => [v.toFixed(4), 'Activation']}
              />
              <Line
                type="monotone"
                dataKey="activation"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#6366f1' }}
                activeDot={{ r: 5 }}
              />
              {peakPt && (
                <ReferenceDot
                  x={peakPt.second}
                  y={peakPt.activation}
                  r={7}
                  fill="#f59e0b"
                  stroke="#f59e0b"
                  label={{ value: 'Peak', position: 'top', fill: '#f59e0b', fontSize: 11 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Section ranking */}
        <div className="bg-raven-surface border border-raven-border rounded-2xl p-6">
          <h2 className="font-semibold text-white mb-4">🏆 Section Ranking</h2>
          {sections.map((sec) => (
            <SectionBar
              key={sec.name}
              name={sec.name}
              score={sec.score}
              maxScore={maxScore}
              rank={sec.rank}
              total={sections.length}
            />
          ))}
        </div>
      </div>

      {/* Insights */}
      <div className="mb-10">
        <h2 className="font-semibold text-white text-xl mb-4">💡 Insights</h2>
        {primaryInsight && <InsightCard insight={primaryInsight} />}
        {weaknessInsight && <InsightCard insight={weaknessInsight} />}
        {recInsight && <InsightCard insight={recInsight} />}
        {otherInsights.map((ins, i) => (
          <InsightCard key={i} insight={ins} />
        ))}
      </div>

      {/* Footer actions */}
      <div className="flex gap-4 flex-wrap">
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `raven_report_${result.job_id.slice(0, 8)}.json`
            a.click()
          }}
          className="btn-primary"
        >
          📥 Download Report (JSON)
        </button>
        <button
          onClick={() => router.push('/upload')}
          className="border border-raven-border text-raven-muted hover:text-white hover:border-raven-accent rounded-xl px-8 py-3 transition-colors font-semibold"
        >
          Analyze Another Reel
        </button>
      </div>
    </main>
  )
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-raven-muted">Loading…</div>}>
      <ResultsContent />
    </Suspense>
  )
}
