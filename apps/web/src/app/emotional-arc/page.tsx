'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { signUpload, uploadFile, createJob, pollJob, getResult } from '@/lib/api'
import type { AnalysisResult, EmotionLabel } from '@/types/schema'

type Stage = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

const EMOTION_COLORS: Record<EmotionLabel, string> = {
  excitement: '#a855f7',
  curiosity: '#06b6d4',
  surprise: '#f59e0b',
  neutral: '#64748b',
  boredom: '#ef4444',
  confusion: '#f97316',
}

const EMOTION_ICONS: Record<EmotionLabel, string> = {
  excitement: '🤩',
  curiosity: '🤔',
  surprise: '😲',
  neutral: '😐',
  boredom: '😴',
  confusion: '😕',
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
      className="border-2 border-dashed border-slate-600 hover:border-purple-500 rounded-2xl p-16 text-center cursor-pointer transition-colors"
    >
      <div className="text-5xl mb-4">💜</div>
      <p className="text-white font-semibold">Drag & drop your video here</p>
      <p className="text-slate-400 text-sm mt-2">MP4, MOV, AVI, WebM</p>
      <button className="btn-primary mt-6 text-sm">Browse Files</button>
      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </div>
  )
}

function StatCard({ icon, value, label, sub }: { icon: string; value: string; label: string; sub?: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 text-center">
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

interface EmotionSpike {
  second: number
  valence: number
  arousal: number
  dominant_emotion: EmotionLabel
  magnitude: number
}

function findTopSpikes(arc: AnalysisResult['emotional_arc'], n = 3): EmotionSpike[] {
  if (!arc || arc.length === 0) return []
  const withMag = arc.map((p) => ({
    ...p,
    magnitude: Math.abs(p.valence) + p.arousal,
  }))
  withMag.sort((a, b) => b.magnitude - a.magnitude)
  const top = withMag.slice(0, n)
  top.sort((a, b) => a.second - b.second)
  return top
}

export default function EmotionalArcPage() {
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

  const arc = result?.emotional_arc
  const summary = result?.summary

  const chartData = (arc ?? []).map((p) => ({
    second: p.second,
    valence: p.valence,
    arousal: p.arousal,
  }))

  const spikes = findTopSpikes(arc)

  const avgValence = summary?.avg_valence ?? 0
  const avgArousal = summary?.avg_arousal ?? 0

  // Emotion label timeline — sample every 2 seconds to avoid overcrowding
  const emotionTimeline = (arc ?? []).filter((_, i) => i % 2 === 0)

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar title="Emotional Arc" />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {stage === 'idle' && (
          <div className="max-w-xl mx-auto mt-8">
            <h1 className="text-3xl font-extrabold text-center mb-2">💜 Emotional Journey</h1>
            <p className="text-slate-400 text-center mb-8">Trace how viewer emotions shift second-by-second</p>
            <UploadZone onFile={processFile} />
          </div>
        )}

        {stage === 'uploading' && (
          <div className="max-w-md mx-auto mt-16 text-center space-y-4">
            <div className="text-5xl">📤</div>
            <h2 className="text-xl font-bold">Uploading…</h2>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-600 to-pink-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-slate-400 text-sm">{progress}%</p>
          </div>
        )}

        {stage === 'processing' && (
          <div className="max-w-md mx-auto mt-16 text-center space-y-4">
            <div className="text-5xl animate-pulse">💜</div>
            <h2 className="text-xl font-bold">Mapping Emotional Arc…</h2>
            <p className="text-slate-400 text-sm">Analyzing valence and arousal patterns</p>
            <div className="flex justify-center gap-1 mt-4">
              {[0,1,2].map((i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
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
            {arc && arc.length > 0 ? (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <StatCard
                    icon="🌊"
                    value={avgValence >= 0 ? `+${avgValence.toFixed(2)}` : avgValence.toFixed(2)}
                    label="Average Valence"
                    sub={avgValence > 0.2 ? 'Generally positive' : avgValence < -0.2 ? 'Generally negative' : 'Emotionally neutral'}
                  />
                  <StatCard
                    icon="⚡"
                    value={`${(avgArousal * 100).toFixed(0)}%`}
                    label="Average Arousal"
                    sub={avgArousal > 0.6 ? 'High energy' : avgArousal > 0.35 ? 'Moderate energy' : 'Low energy'}
                  />
                </div>

                {/* Main Chart */}
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                  <h2 className="text-lg font-bold mb-2">📈 Valence & Arousal Over Time</h2>
                  <p className="text-xs text-slate-400 mb-4">Valence: positive (purple) vs negative (red) sentiment · Arousal: energy level (cyan)</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="second" stroke="#64748b" tick={{ fontSize: 11 }} label={{ value: 'Second', position: 'insideBottomRight', offset: -5, fill: '#64748b', fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[-1, 1]} />
                      <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                      <Legend />
                      <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 4" />
                      <Line
                        type="monotone" dataKey="valence" name="Valence"
                        stroke="#a855f7" strokeWidth={2} dot={false}
                      />
                      <Line
                        type="monotone" dataKey="arousal" name="Arousal"
                        stroke="#06b6d4" strokeWidth={2} dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Emotion Label Timeline */}
                {emotionTimeline.length > 0 && (
                  <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                    <h2 className="text-lg font-bold mb-4">🎭 Dominant Emotion Timeline</h2>
                    <div className="flex flex-wrap gap-2">
                      {emotionTimeline.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1"
                          style={{
                            background: (EMOTION_COLORS[p.dominant_emotion] ?? '#64748b') + '33',
                            color: EMOTION_COLORS[p.dominant_emotion] ?? '#94a3b8',
                            border: `1px solid ${(EMOTION_COLORS[p.dominant_emotion] ?? '#64748b')}66`,
                          }}
                        >
                          <span>{EMOTION_ICONS[p.dominant_emotion]}</span>
                          <span>{p.second}s</span>
                          <span className="opacity-70">{p.dominant_emotion}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Peak Emotion Moments */}
                {spikes.length > 0 && (
                  <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                    <h2 className="text-lg font-bold mb-4">⚡ Top Emotional Spikes</h2>
                    <div className="grid md:grid-cols-3 gap-4">
                      {spikes.map((spike, i) => (
                        <div
                          key={i}
                          className="rounded-xl p-4 border"
                          style={{
                            background: (EMOTION_COLORS[spike.dominant_emotion] ?? '#64748b') + '15',
                            borderColor: (EMOTION_COLORS[spike.dominant_emotion] ?? '#64748b') + '40',
                          }}
                        >
                          <div className="text-2xl mb-2">{EMOTION_ICONS[spike.dominant_emotion]}</div>
                          <div className="text-lg font-bold text-white">{spike.second}s</div>
                          <div className="text-sm capitalize font-medium" style={{ color: EMOTION_COLORS[spike.dominant_emotion] ?? '#94a3b8' }}>{spike.dominant_emotion}</div>
                          <div className="text-xs text-slate-400 mt-2">
                            Valence: {spike.valence >= 0 ? '+' : ''}{spike.valence.toFixed(2)} · Arousal: {(spike.arousal * 100).toFixed(0)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Legend */}
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
                  <h3 className="text-sm font-bold mb-3 text-slate-300">Emotion Color Guide</h3>
                  <div className="flex flex-wrap gap-3">
                    {(Object.entries(EMOTION_COLORS) as [EmotionLabel, string][]).map(([emotion, color]) => (
                      <div key={emotion} className="flex items-center gap-2 text-xs text-slate-400">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        <span className="capitalize">{emotion}</span>
                        <span>{EMOTION_ICONS[emotion]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="relative bg-slate-800/40 border border-slate-700/30 rounded-2xl p-16 text-center overflow-hidden">
                <div className="absolute inset-0 backdrop-blur-sm bg-slate-950/60 flex flex-col items-center justify-center gap-4">
                  <div className="text-4xl">🔒</div>
                  <h3 className="text-xl font-bold text-white">Emotional Arc Locked</h3>
                  <p className="text-slate-400 text-sm max-w-sm">Emotional arc data was not returned by this analysis. This field is optional and may require an upgraded model.</p>
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
