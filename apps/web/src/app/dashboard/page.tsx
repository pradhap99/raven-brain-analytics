'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceDot,
} from 'recharts'
import { signUpload, uploadFile, createJob, pollJob, getResult } from '@/lib/api'
import type { AnalysisResult, Insight } from '@/types/schema'

const C = {
  accent: '#6366f1', cyan: '#06b6d4', pink: '#ec4899',
  amber: '#f59e0b', green: '#22c55e', red: '#ef4444',
  purple: '#a855f7', blue: '#3b82f6',
}
const ZONE_COLORS: Record<string, string> = { high: '#22c55e', medium: '#eab308', low: '#f97316', drop: '#ef4444' }
const GRADE_COLORS: Record<string, string> = { A: '#22c55e', B: '#eab308', C: '#f97316', D: '#ef4444' }
const EMOTION_COLORS: Record<string, string> = {
  excitement: '#a855f7', curiosity: '#06b6d4', surprise: '#f59e0b',
  neutral: '#64748b', boredom: '#ef4444', confusion: '#f97316',
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
const LOAD_COLORS: Record<string, string> = { low: '#22c55e', medium: '#eab308', high: '#ef4444' }

type Stage = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

function Navbar({ title }: { title: string }) {
  const router = useRouter()
  return (
    <div className="bg-slate-800/50 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Link href="/">
          <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold cursor-pointer">R</div>
        </Link>
        <span className="font-semibold text-lg">{title}</span>
      </div>
      <button onClick={() => router.push('/upload')} className="btn-primary text-sm py-2 px-4">Upload</button>
    </div>
  )
}

function GradeRing({ grade, size = 96 }: { grade: string; size?: number }) {
  const color = GRADE_COLORS[grade] || '#64748b'
  return (
    <div className="flex flex-col items-center">
      <div className="rounded-full flex items-center justify-center font-black" style={{ width: size, height: size, border: `4px solid ${color}`, fontSize: size * 0.42, color }}>{grade}</div>
      <span className="text-xs text-slate-400 mt-1">Overall Grade</span>
    </div>
  )
}

function StatCard({ icon, value, label, color }: { icon: string; value: string; label: string; color?: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xl font-bold" style={{ color: color || '#fff' }}>{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
    </div>
  )
}

function Bar2({ value, max = 1, color = C.accent }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs text-slate-400 w-10 text-right">{pct}%</span>
    </div>
  )
}

function InsightCard({ insight }: { insight: Insight }) {
  const style = INSIGHT_STYLES[insight.type] ?? INSIGHT_STYLES.general
  return (
    <div className={`bg-slate-800/60 border-l-4 ${style.border} rounded-lg px-4 py-3`}>
      <div className="flex items-start gap-2">
        {insight.icon && <span className="text-lg">{insight.icon}</span>}
        <div className="flex-1">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.badge} mr-2`}>{style.label}</span>
          <span className="text-slate-200 text-sm">{insight.text}</span>
          {insight.confidence != null && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Confidence</span><span>{Math.round(insight.confidence * 100)}%</span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-purple-500" style={{ width: `${Math.round(insight.confidence * 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SkeletonCard({ label }: { label: string }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/30 rounded-2xl p-6 relative overflow-hidden">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <span className="text-2xl opacity-30">🔒</span>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <div className="h-32 opacity-0" />
    </div>
  )
}

function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f?.type.startsWith('video/')) onFile(f)
  }, [onFile])
  return (
    <div
      onDrop={onDrop} onDragOver={(e) => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      className="border-2 border-dashed border-slate-600 hover:border-purple-500 rounded-2xl p-16 text-center cursor-pointer transition-colors"
    >
      <div className="text-5xl mb-4">📂</div>
      <p className="text-white font-semibold">Drag & drop your video here</p>
      <p className="text-slate-400 text-sm mt-2">MP4, MOV, AVI, WebM</p>
      <button className="btn-primary mt-6 text-sm">Browse Files</button>
      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </div>
  )
}

export default function DashboardPage() {
  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  async function processFile(file: File) {
    setStage('uploading')
    setProgress(0)
    try {
      const { upload_url, object_key } = await signUpload(file.name, file.type || 'video/mp4', file.size)
      await uploadFile(file, upload_url, object_key, setProgress)
      const job = await createJob(object_key, file.name, file.size)
      setStage('processing')
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000))
        const status = await pollJob(job.job_id)
        if (status.status === 'completed') break
        if (status.status === 'failed') throw new Error(status.error ?? 'Analysis failed')
      }
      const data = await getResult(job.job_id)
      setResult(data)
      setStage('done')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error')
      setStage('error')
    }
  }

  const { summary, sections, timeline, insights, brain_regions_summary, emotional_arc, retention_curve, engagement_zones, pacing, hook_analysis } = result ?? {}

  const chartData = (timeline ?? []).map((p) => ({ second: p.second, activation: p.activation }))
  const peakIdx = summary?.peak_segment ?? 0
  const peakPt = timeline?.[peakIdx]
  const brainData = brain_regions_summary ? [
    { region: 'Reward (NAcc)', value: brain_regions_summary.nacc },
    { region: 'Valuation (mPFC)', value: brain_regions_summary.mpfc },
    { region: 'Salience (Insula)', value: brain_regions_summary.ains },
    { region: 'Visual Cortex', value: brain_regions_summary.visual_cortex },
    { region: 'Emotion (Amy)', value: brain_regions_summary.amygdala },
  ] : []
  const emotionChartData = (emotional_arc ?? []).map((e) => ({ second: e.second, valence: e.valence, arousal: e.arousal }))
  const retentionData = (retention_curve ?? []).map((r) => ({ second: r.second, retention: r.retention_pct }))

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar title="Single Video Analysis" />

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* IDLE */}
        {stage === 'idle' && (
          <div className="max-w-xl mx-auto mt-8">
            <h1 className="text-3xl font-extrabold text-center mb-2">🧠 Video Deep-Dive</h1>
            <p className="text-slate-400 text-center mb-8">Upload a video to get full neural engagement analysis</p>
            <UploadZone onFile={processFile} />
          </div>
        )}

        {/* UPLOADING */}
        {stage === 'uploading' && (
          <div className="max-w-md mx-auto mt-16 text-center space-y-4">
            <div className="text-5xl mb-4">📤</div>
            <h2 className="text-xl font-bold">Uploading…</h2>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-600 to-cyan-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-slate-400 text-sm">{progress}%</p>
          </div>
        )}

        {/* PROCESSING */}
        {stage === 'processing' && (
          <div className="max-w-md mx-auto mt-16 text-center space-y-4">
            <div className="text-5xl mb-4 animate-pulse">🧠</div>
            <h2 className="text-xl font-bold">Running Tribe V2 Analysis…</h2>
            <p className="text-slate-400 text-sm">This may take 30–60 seconds</p>
            <div className="flex justify-center gap-1 mt-4">
              {[0,1,2].map((i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* ERROR */}
        {stage === 'error' && (
          <div className="max-w-md mx-auto mt-16 text-center space-y-4">
            <div className="text-5xl">❌</div>
            <h2 className="text-xl font-bold text-red-400">Analysis Failed</h2>
            <p className="text-slate-400 text-sm">{errorMsg}</p>
            <button onClick={() => setStage('idle')} className="btn-primary text-sm">Try Again</button>
          </div>
        )}

        {/* DONE */}
        {stage === 'done' && result && summary && (
          <>
            {/* Hero Score Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 items-stretch">
              <div className="col-span-2 md:col-span-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6 flex items-center justify-center">
                <GradeRing grade={summary.overall_grade} />
              </div>
              <StatCard icon="🧠" value={`${Math.round(summary.predicted_attention * 100)}%`} label="Predicted Attention" color={C.cyan} />
              <StatCard icon="⚡" value={`${Math.round(summary.peak_activation * 100)}%`} label="Peak Activation" color={C.amber} />
              <StatCard icon="📣" value={`${Math.round(summary.cta_strength * 100)}%`} label="CTA Strength" color={C.pink} />
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
                <div className="text-2xl mb-1">⚙️</div>
                <div className="text-sm font-bold capitalize px-2 py-0.5 rounded-full inline-block" style={{ background: (LOAD_COLORS[summary.cognitive_load] ?? '#64748b') + '33', color: LOAD_COLORS[summary.cognitive_load] ?? '#94a3b8' }}>{summary.cognitive_load}</div>
                <div className="text-xs text-slate-400 mt-1">Cognitive Load</div>
              </div>
              <StatCard icon="🔥" value={`${Math.round(summary.virality_score * 100)}%`} label="Virality Score" color={C.purple} />
              <StatCard icon="📉" value={`${Math.round(summary.predicted_retention_pct)}%`} label="Retention" color={C.green} />
            </div>

            {/* Engagement Timeline */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4">⚡ Engagement Timeline</h2>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="dbGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.accent} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="second" stroke="#64748b" tick={{ fontSize: 11 }} label={{ value: 'Second', position: 'insideBottomRight', offset: -5, fill: '#64748b', fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 1]} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={(v: number) => [`${Math.round(v * 100)}%`, 'Activation']} />
                  <Area type="monotone" dataKey="activation" stroke={C.accent} fill="url(#dbGrad)" strokeWidth={2} />
                  {peakPt && <ReferenceDot x={peakPt.second} y={peakPt.activation} r={6} fill={C.amber} stroke={C.amber} />}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Section Scores */}
            {sections && sections.length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-bold mb-4">📋 Section Scores</h2>
                <div className="space-y-3">
                  {sections.map((sec, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <span className="text-slate-300 text-sm font-medium w-24 shrink-0">{sec.name}</span>
                      <div className="flex-1">
                        <Bar2 value={sec.score} max={1} color={C.accent} />
                      </div>
                      <span className="text-xs text-slate-400 w-16 shrink-0 text-right">{sec.start_seconds}s{sec.end_seconds != null ? ` – ${sec.end_seconds}s` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Brain Radar + Emotional Arc */}
            <div className="grid md:grid-cols-2 gap-6">
              {brainData.length > 0 ? (
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                  <h2 className="text-lg font-bold mb-4">🔬 Brain Region Radar</h2>
                  <ResponsiveContainer width="100%" height={240}>
                    <RadarChart data={brainData}>
                      <PolarGrid stroke="#334155" />
                      <PolarAngleAxis dataKey="region" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <PolarRadiusAxis domain={[0, 1]} tick={{ fill: '#64748b', fontSize: 9 }} />
                      <Radar dataKey="value" stroke={C.cyan} fill={C.cyan} fillOpacity={0.3} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <SkeletonCard label="Brain radar — requires full Tribe V2 model" />
              )}

              {emotionChartData.length > 0 ? (
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                  <h2 className="text-lg font-bold mb-4">💜 Emotional Arc</h2>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={emotionChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="second" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[-1, 1]} />
                      <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                      <Legend />
                      <Line type="monotone" dataKey="valence" stroke={C.purple} strokeWidth={2} dot={false} name="Valence" />
                      <Line type="monotone" dataKey="arousal" stroke={C.cyan} strokeWidth={2} dot={false} name="Arousal" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <SkeletonCard label="Emotional arc — optional field" />
              )}
            </div>

            {/* Engagement Zones */}
            {engagement_zones && engagement_zones.length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-bold mb-4">🎯 Engagement Zones</h2>
                <div className="relative h-12 flex rounded-xl overflow-hidden">
                  {(() => {
                    const total = engagement_zones[engagement_zones.length - 1]?.end_seconds ?? 1
                    return engagement_zones.map((z, i) => {
                      const w = ((z.end_seconds - z.start_seconds) / total) * 100
                      return (
                        <div key={i} className="flex items-center justify-center text-xs font-medium text-white/80 transition-all"
                          style={{ width: `${w}%`, backgroundColor: ZONE_COLORS[z.zone] ?? '#64748b', minWidth: 4 }}
                          title={`${z.label} (${z.start_seconds}s – ${z.end_seconds}s)`}>
                          {w > 8 ? z.label : ''}
                        </div>
                      )
                    })
                  })()}
                </div>
                <div className="flex gap-4 mt-3 flex-wrap">
                  {Object.entries(ZONE_COLORS).map(([zone, color]) => (
                    <div key={zone} className="flex items-center gap-1.5 text-xs text-slate-400">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                      <span className="capitalize">{zone}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Retention Curve */}
            {retentionData.length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-bold mb-4">📉 Retention Curve</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={retentionData}>
                    <defs>
                      <linearGradient id="retGradDb" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.green} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="second" stroke="#64748b" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={(v: number) => [`${v}%`, 'Retention']} />
                    <Area type="monotone" dataKey="retention" stroke={C.green} fill="url(#retGradDb)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Pacing Metrics */}
            {pacing ? (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-bold mb-4">🎬 Pacing Metrics</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <StatCard icon="🎞️" value={String(pacing.scene_count)} label="Scene Count" />
                  <StatCard icon="⏱️" value={`${pacing.avg_scene_duration.toFixed(1)}s`} label="Avg Scene Duration" />
                  <StatCard icon="📊" value={pacing.visual_change_rate.toFixed(2)} label="Visual Change Rate/s" />
                  <StatCard icon="🥁" value={`${Math.round(pacing.pacing_score * 100)}%`} label="Pacing Score" color={C.accent} />
                  <StatCard icon="🔄" value={`${Math.round(pacing.rhythm_consistency * 100)}%`} label="Rhythm Consistency" color={C.cyan} />
                </div>
              </div>
            ) : (
              <SkeletonCard label="Pacing metrics — optional field" />
            )}

            {/* Hook Analysis */}
            {hook_analysis ? (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-bold mb-4">🎣 Hook Analysis</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <StatCard icon="🛑" value={`${Math.round(hook_analysis.scroll_stop_probability * 100)}%`} label="Scroll-Stop Probability" color={C.pink} />
                  <StatCard icon="💪" value={`${Math.round(hook_analysis.hook_strength * 100)}%`} label="Hook Strength" color={C.purple} />
                  <StatCard icon="⚡" value={`${(hook_analysis.time_to_peak_ms / 1000).toFixed(1)}s`} label="Time to Peak" color={C.amber} />
                  <StatCard icon="🖼️" value={`${Math.round(hook_analysis.first_frame_score * 100)}%`} label="First Frame Score" color={C.cyan} />
                </div>
                {hook_analysis.recommendation && (
                  <div className="bg-slate-900/50 border border-slate-600/50 rounded-xl p-4 text-slate-300 text-sm">
                    💡 {hook_analysis.recommendation}
                  </div>
                )}
              </div>
            ) : (
              <SkeletonCard label="Hook analysis — optional field" />
            )}

            {/* AI Insights */}
            {insights && insights.length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-bold mb-4">💡 AI Insights</h2>
                <div className="space-y-2">
                  {insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
                </div>
              </div>
            )}

            {/* Bottom nav */}
            <div className="flex gap-4 justify-center pt-4 pb-8">
              <Link href="/compare" className="bg-slate-800 border border-slate-700 hover:border-purple-500 text-slate-300 hover:text-white rounded-xl px-6 py-3 text-sm font-medium transition-colors">
                ⚖️ A/B Compare →
              </Link>
              <Link href="/hook-optimizer" className="bg-slate-800 border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-white rounded-xl px-6 py-3 text-sm font-medium transition-colors">
                🎣 Hook Optimizer →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
