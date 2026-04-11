'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot, ReferenceLine,
} from 'recharts'
import { signUpload, uploadFile, createJob, pollJob, getResult } from '@/lib/api'
import type { AnalysisResult } from '@/types/schema'

type Stage = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

const ZONE_COLORS: Record<string, string> = { high: '#22c55e', medium: '#eab308', low: '#f97316', drop: '#ef4444' }
const GRADE_COLORS: Record<string, string> = { A: '#22c55e', B: '#eab308', C: '#f97316', D: '#ef4444' }

function retentionGrade(pct: number): string {
  if (pct >= 75) return 'A'
  if (pct >= 55) return 'B'
  if (pct >= 35) return 'C'
  return 'D'
}

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
      className="border-2 border-dashed border-slate-600 hover:border-green-500 rounded-2xl p-16 text-center cursor-pointer transition-colors"
    >
      <div className="text-5xl mb-4">📉</div>
      <p className="text-white font-semibold">Drag & drop your video here</p>
      <p className="text-slate-400 text-sm mt-2">MP4, MOV, AVI, WebM</p>
      <button className="btn-primary mt-6 text-sm">Browse Files</button>
      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </div>
  )
}

function GradeRing({ grade, size = 96 }: { grade: string; size?: number }) {
  const color = GRADE_COLORS[grade] || '#64748b'
  return (
    <div className="flex flex-col items-center">
      <div className="rounded-full flex items-center justify-center font-black" style={{ width: size, height: size, border: `4px solid ${color}`, fontSize: size * 0.42, color }}>{grade}</div>
      <span className="text-xs text-slate-400 mt-1">Retention Grade</span>
    </div>
  )
}

interface DropMarker {
  second: number
  from: number
  to: number
  drop: number
}

function findDropMarkers(curve: AnalysisResult['retention_curve'], threshold = 10): DropMarker[] {
  if (!curve || curve.length < 2) return []
  const markers: DropMarker[] = []
  for (let i = 1; i < curve.length; i++) {
    const drop = curve[i - 1].retention_pct - curve[i].retention_pct
    if (drop >= threshold) {
      markers.push({ second: curve[i].second, from: curve[i - 1].retention_pct, to: curve[i].retention_pct, drop })
    }
  }
  markers.sort((a, b) => b.drop - a.drop)
  return markers
}

function retentionRecommendation(marker: DropMarker, idx: number): string {
  const recs = [
    `At ${marker.second}s, viewers drop off sharply (−${marker.drop.toFixed(0)}%). Add a pattern interrupt — a new visual, text overlay, or hook — to re-engage.`,
    `The ${marker.drop.toFixed(0)}% drop at ${marker.second}s suggests content fatigue. Consider trimming this section or adding energy.`,
    `Retention falls ${marker.drop.toFixed(0)}% at ${marker.second}s. Reposition your strongest moment here to prevent drop-off.`,
  ]
  return recs[idx % recs.length]
}

export default function RetentionPage() {
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

  const curve = result?.retention_curve
  const zones = result?.engagement_zones
  const summary = result?.summary
  const benchmark = result?.benchmark

  const retentionData = (curve ?? []).map((r) => ({ second: r.second, retention: r.retention_pct }))
  const dropMarkers = findDropMarkers(curve)

  const retPct = summary?.predicted_retention_pct ?? 0
  const grade = retentionGrade(retPct)

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar title="Retention Predictor" />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {stage === 'idle' && (
          <div className="max-w-xl mx-auto mt-8">
            <h1 className="text-3xl font-extrabold text-center mb-2">📉 Retention Predictor</h1>
            <p className="text-slate-400 text-center mb-8">Predict where viewers drop off and how to keep them watching</p>
            <UploadZone onFile={processFile} />
          </div>
        )}

        {stage === 'uploading' && (
          <div className="max-w-md mx-auto mt-16 text-center space-y-4">
            <div className="text-5xl">📤</div>
            <h2 className="text-xl font-bold">Uploading…</h2>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-green-600 to-yellow-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-slate-400 text-sm">{progress}%</p>
          </div>
        )}

        {stage === 'processing' && (
          <div className="max-w-md mx-auto mt-16 text-center space-y-4">
            <div className="text-5xl animate-pulse">📉</div>
            <h2 className="text-xl font-bold">Predicting Retention…</h2>
            <p className="text-slate-400 text-sm">Analyzing viewer drop-off patterns</p>
            <div className="flex justify-center gap-1 mt-4">
              {[0,1,2].map((i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div className="max-w-md mx-auto mt-16 text-center space-y-4">
            <div className="text-5xl">❌</div>
            <h2 className="text-xl font-bold text-red-400">Analysis Failed</h2>
            <p className="text-slate-400 text-sm">{errorMsg}</p>
            <button onClick={() => setStage('idle')} className="btn-primary text-sm">Try Again</button>
          </div>
        )}

        {stage === 'done' && result && summary && (
          <>
            {/* Hero */}
            <div className="grid md:grid-cols-3 gap-4 items-stretch">
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6 flex flex-col items-center justify-center">
                <GradeRing grade={grade} size={96} />
              </div>
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6 text-center flex flex-col items-center justify-center">
                <div className="text-5xl font-black text-green-400">{Math.round(retPct)}%</div>
                <div className="text-xs text-slate-400 mt-2 uppercase tracking-widest">Predicted Retention</div>
                <div className="text-xs text-slate-500 mt-1">
                  {retPct >= 70 ? 'Excellent — keep it up!' : retPct >= 50 ? 'Good — room to improve' : 'Needs improvement'}
                </div>
              </div>
              {benchmark ? (
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 space-y-3">
                  <div className="text-sm font-bold text-slate-300">📊 Benchmark ({benchmark.category})</div>
                  <div className="space-y-2 text-xs text-slate-400">
                    <div className="flex justify-between"><span>Your Attention</span><span className="text-white font-semibold">{(benchmark.your_attention * 100).toFixed(0)}%</span></div>
                    <div className="flex justify-between"><span>Category Avg</span><span>{(benchmark.avg_attention_in_category * 100).toFixed(0)}%</span></div>
                    <div className="flex justify-between"><span>Top 10% threshold</span><span className="text-amber-400">{(benchmark.top_10_pct_threshold * 100).toFixed(0)}%</span></div>
                    <div className="flex justify-between"><span>Percentile</span><span className="text-cyan-400">{benchmark.percentile}th</span></div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-800/40 border border-slate-700/30 rounded-2xl p-5 flex items-center justify-center text-center">
                  <div>
                    <div className="text-2xl mb-2 opacity-40">📊</div>
                    <p className="text-xs text-slate-500">Benchmark data not available</p>
                  </div>
                </div>
              )}
            </div>

            {/* Retention Curve */}
            {retentionData.length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-bold mb-4">📈 Retention Curve</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={retentionData}>
                    <defs>
                      <linearGradient id="retCurveGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="second" stroke="#64748b" tick={{ fontSize: 11 }} label={{ value: 'Second', position: 'insideBottomRight', offset: -5, fill: '#64748b', fontSize: 11 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={(v: number) => [`${v}%`, 'Retention']} />
                    <Area type="monotone" dataKey="retention" stroke="#22c55e" fill="url(#retCurveGrad)" strokeWidth={2} />
                    {dropMarkers.slice(0, 5).map((m, i) => (
                      <ReferenceDot key={i} x={m.second} y={m.to} r={5} fill="#ef4444" stroke="#ef4444" />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Drop-off Markers */}
            {dropMarkers.length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-bold mb-4">🚨 Drop-off Points</h2>
                <div className="space-y-3">
                  {dropMarkers.slice(0, 5).map((m, i) => (
                    <div key={i} className="flex items-start gap-4 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                      <div className="shrink-0 text-center">
                        <div className="text-lg font-black text-red-400">{m.second}s</div>
                        <div className="text-xs text-slate-500">−{m.drop.toFixed(0)}%</div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-slate-400">{m.from.toFixed(0)}% → {m.to.toFixed(0)}%</span>
                          <span className="text-xs font-semibold text-red-400">−{m.drop.toFixed(0)}% drop</span>
                        </div>
                        <p className="text-xs text-slate-300">{retentionRecommendation(m, i)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Engagement Zones */}
            {zones && zones.length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-bold mb-4">🎯 Engagement Zones</h2>
                <div className="relative h-12 flex rounded-xl overflow-hidden">
                  {(() => {
                    const total = zones[zones.length - 1]?.end_seconds ?? 1
                    return zones.map((z, i) => {
                      const w = ((z.end_seconds - z.start_seconds) / total) * 100
                      return (
                        <div key={i} className="flex items-center justify-center text-xs font-medium text-white/80"
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

            {/* Benchmark comparison line chart */}
            {benchmark && retentionData.length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-bold mb-4">📊 vs. Category Average</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={retentionData}>
                    <defs>
                      <linearGradient id="retBenchGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="second" stroke="#64748b" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={(v: number) => [`${v.toFixed(1)}%`, 'Retention']} />
                    <Area type="monotone" dataKey="retention" stroke="#22c55e" fill="url(#retBenchGrad)" strokeWidth={2} name="Your Video" />
                    <ReferenceLine
                      y={benchmark.avg_attention_in_category * 100}
                      stroke="#64748b"
                      strokeDasharray="4 4"
                      label={{ value: `Avg ${(benchmark.avg_attention_in_category * 100).toFixed(0)}%`, position: 'insideTopRight', fill: '#64748b', fontSize: 10 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
