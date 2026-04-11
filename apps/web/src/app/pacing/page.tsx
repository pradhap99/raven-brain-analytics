'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { signUpload, uploadFile, createJob, pollJob, getResult } from '@/lib/api'
import type { AnalysisResult } from '@/types/schema'

type Stage = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

function pacingInterpretation(score: number): { label: string; color: string; desc: string } {
  if (score < 0.4) return { label: 'Too Slow', color: '#ef4444', desc: 'Your video feels sluggish. Reduce avg scene duration and add more visual variety to maintain attention.' }
  if (score <= 0.7) return { label: 'Well Paced', color: '#22c55e', desc: 'Your pacing is in the sweet spot for IG Reels. Viewers can follow the content without feeling rushed or bored.' }
  return { label: 'Fast-Paced', color: '#f59e0b', desc: 'High energy pacing — great for hooks, but may feel overwhelming for longer content. Ensure key messages land clearly.' }
}

function sceneDurationRec(avgDuration: number): string {
  if (avgDuration < 1.5) return '⚡ Scenes are very short (<1.5s). This is ideal for high-energy content. Make sure each cut adds visual value.'
  if (avgDuration <= 3) return '✅ Scene duration is within the IG Reels sweet spot (1.5–3s). Keep it up!'
  if (avgDuration <= 5) return '⚠️ Scenes average 3–5s. Consider tightening cuts to maintain viewer energy. IG best practice: 2–3s per scene.'
  return '🐢 Long scenes (>5s). IG Reels best practice is 1.5–3s per scene. Shorten cuts to increase pacing score.'
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
      className="border-2 border-dashed border-slate-600 hover:border-amber-500 rounded-2xl p-16 text-center cursor-pointer transition-colors"
    >
      <div className="text-5xl mb-4">🎬</div>
      <p className="text-white font-semibold">Drag & drop your video here</p>
      <p className="text-slate-400 text-sm mt-2">MP4, MOV, AVI, WebM</p>
      <button className="btn-primary mt-6 text-sm">Browse Files</button>
      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </div>
  )
}

function StatCard({ icon, value, label, color, sub }: { icon: string; value: string; label: string; color?: string; sub?: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 text-center">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-2xl font-black" style={{ color: color || '#fff' }}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function PacingMeter({ score }: { score: number }) {
  const interp = pacingInterpretation(score)
  const pct = Math.round(score * 100)
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
      <h2 className="text-lg font-bold mb-4">🥁 Pacing Score</h2>
      <div className="flex items-center gap-6">
        <div className="shrink-0 text-center">
          <div className="text-5xl font-black" style={{ color: interp.color }}>{pct}</div>
          <div className="text-xs text-slate-400 mt-1">/ 100</div>
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ background: interp.color + '22', color: interp.color }}>
              {interp.label}
            </span>
          </div>
          <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: interp.color }} />
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Too Slow</span><span>Good</span><span>Fast</span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{interp.desc}</p>
        </div>
      </div>
    </div>
  )
}

export default function PacingPage() {
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

  const pacing = result?.pacing
  const timeline = result?.timeline ?? []

  // Build visual change rate chart from timeline activation changes
  const changeRateData = timeline.map((pt, i) => ({
    second: pt.second,
    change: i === 0 ? 0 : Math.abs(pt.activation - (timeline[i - 1]?.activation ?? pt.activation)),
  }))

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar title="Pacing Analysis" />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {stage === 'idle' && (
          <div className="max-w-xl mx-auto mt-8">
            <h1 className="text-3xl font-extrabold text-center mb-2">🎬 Pacing Analysis</h1>
            <p className="text-slate-400 text-center mb-8">Analyze your video's rhythm and scene cadence</p>
            <UploadZone onFile={processFile} />
          </div>
        )}

        {stage === 'uploading' && (
          <div className="max-w-md mx-auto mt-16 text-center space-y-4">
            <div className="text-5xl">📤</div>
            <h2 className="text-xl font-bold">Uploading…</h2>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-slate-400 text-sm">{progress}%</p>
          </div>
        )}

        {stage === 'processing' && (
          <div className="max-w-md mx-auto mt-16 text-center space-y-4">
            <div className="text-5xl animate-pulse">🎬</div>
            <h2 className="text-xl font-bold">Analyzing Pacing…</h2>
            <p className="text-slate-400 text-sm">Detecting scene changes and rhythm patterns</p>
            <div className="flex justify-center gap-1 mt-4">
              {[0,1,2].map((i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
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

        {stage === 'done' && result && (
          <>
            {pacing ? (
              <>
                {/* Pacing Meter */}
                <PacingMeter score={pacing.pacing_score} />

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard icon="🎞️" value={String(pacing.scene_count)} label="Total Scenes" />
                  <StatCard icon="⏱️" value={`${pacing.avg_scene_duration.toFixed(1)}s`} label="Avg Scene Duration" color="#06b6d4" />
                  <StatCard icon="📊" value={pacing.visual_change_rate.toFixed(2)} label="Visual Changes/s" color="#a855f7" />
                  <StatCard icon="🔄" value={`${Math.round(pacing.rhythm_consistency * 100)}%`} label="Rhythm Consistency" color="#22c55e" />
                </div>

                {/* Scene Duration Recommendation */}
                <div className="bg-gradient-to-br from-slate-800/60 to-amber-900/10 border border-amber-500/20 rounded-2xl p-6">
                  <h2 className="text-lg font-bold mb-3">💡 IG Reels Scene Duration Advice</h2>
                  <p className="text-slate-300 text-sm leading-relaxed">{sceneDurationRec(pacing.avg_scene_duration)}</p>
                  <div className="mt-4 flex items-center gap-3 bg-slate-900/50 rounded-xl p-3">
                    <div className="shrink-0 text-center">
                      <div className="text-xs text-slate-400 mb-1">Your avg</div>
                      <div className="text-2xl font-black text-white">{pacing.avg_scene_duration.toFixed(1)}s</div>
                    </div>
                    <div className="flex-1 h-4 bg-slate-700 rounded-full overflow-hidden relative">
                      <div className="absolute inset-y-0 left-[15%] w-[30%] bg-green-500/20 border-x border-green-500/40" title="IG sweet spot: 1.5–3s" />
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (pacing.avg_scene_duration / 10) * 100)}%` }}
                      />
                    </div>
                    <div className="shrink-0 text-center">
                      <div className="text-xs text-green-400">Sweet spot</div>
                      <div className="text-xs text-slate-400">1.5–3s</div>
                    </div>
                  </div>
                </div>

                {/* Visual Change Rate Chart */}
                {changeRateData.length > 1 && (
                  <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                    <h2 className="text-lg font-bold mb-4">📈 Visual Change Rate Timeline</h2>
                    <p className="text-xs text-slate-400 mb-4">Spikes indicate rapid scene changes or high visual activity</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={changeRateData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="second" stroke="#64748b" tick={{ fontSize: 11 }} label={{ value: 'Second', position: 'insideBottomRight', offset: -5, fill: '#64748b', fontSize: 11 }} />
                        <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={(v: number) => [v.toFixed(3), 'Change']} />
                        <Bar dataKey="change" fill="#a855f7" fillOpacity={0.8} radius={[2,2,0,0]} name="Change Rate" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Rhythm Consistency Gauge */}
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                  <h2 className="text-lg font-bold mb-4">🎵 Rhythm Consistency</h2>
                  <div className="flex items-center gap-6">
                    <div className="text-4xl font-black text-cyan-400 shrink-0">
                      {Math.round(pacing.rhythm_consistency * 100)}%
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${Math.round(pacing.rhythm_consistency * 100)}%` }} />
                      </div>
                      <p className="text-sm text-slate-300">
                        {pacing.rhythm_consistency > 0.7
                          ? 'Very consistent rhythm — viewers experience a smooth, predictable cadence that feels professional.'
                          : pacing.rhythm_consistency > 0.4
                          ? 'Moderate rhythm consistency. Some variation keeps it interesting, but try to establish a clearer beat.'
                          : 'Inconsistent rhythm. Erratic pacing can disorient viewers. Aim for more uniform scene lengths.'}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="relative bg-slate-800/40 border border-slate-700/30 rounded-2xl p-16 text-center overflow-hidden">
                <div className="absolute inset-0 backdrop-blur-sm bg-slate-950/60 flex flex-col items-center justify-center gap-4">
                  <div className="text-4xl">🔒</div>
                  <h3 className="text-xl font-bold text-white">Pacing Data Locked</h3>
                  <p className="text-slate-400 text-sm max-w-sm">Pacing metrics were not returned by this analysis. This field is optional and may not be available for all videos.</p>
                </div>
                <div className="h-48 opacity-0" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
