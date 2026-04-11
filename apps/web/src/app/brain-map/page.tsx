'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'
import { signUpload, uploadFile, createJob, pollJob, getResult } from '@/lib/api'
import type { AnalysisResult } from '@/types/schema'

type Stage = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

const BRAIN_REGIONS = [
  {
    key: 'nacc' as const,
    name: 'Nucleus Accumbens',
    short: 'NAcc',
    role: 'Reward / Anticipation',
    icon: '🎯',
    color: '#a855f7',
    description: 'Drives reward anticipation and dopamine-mediated engagement. High activation means viewers are hooked and anticipate what comes next.',
  },
  {
    key: 'mpfc' as const,
    name: 'Medial Prefrontal Cortex',
    short: 'mPFC',
    role: 'Valuation / Worth',
    icon: '💎',
    color: '#06b6d4',
    description: 'Evaluates personal relevance and perceived value. High scores indicate viewers find the content meaningful to their lives.',
  },
  {
    key: 'ains' as const,
    name: 'Anterior Insula',
    short: 'Insula',
    role: 'Emotional Salience',
    icon: '🌊',
    color: '#ec4899',
    description: 'Processes emotional salience and gut feelings. High activation creates a visceral, memorable viewing experience.',
  },
  {
    key: 'visual_cortex' as const,
    name: 'Visual Cortex',
    short: 'V1/V2',
    role: 'Visual Processing',
    icon: '👁️',
    color: '#3b82f6',
    description: 'Measures visual stimulus intensity. High activity reflects compelling visuals that capture and hold attention.',
  },
  {
    key: 'amygdala' as const,
    name: 'Amygdala',
    short: 'Amy',
    role: 'Emotional Response',
    icon: '⚡',
    color: '#f59e0b',
    description: 'Governs fear, surprise, and emotional arousal. High scores mean your content triggers strong emotional reactions.',
  },
]

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
      <div className="text-5xl mb-4">🔬</div>
      <p className="text-white font-semibold">Drag & drop your video here</p>
      <p className="text-slate-400 text-sm mt-2">MP4, MOV, AVI, WebM</p>
      <button className="btn-primary mt-6 text-sm">Browse Files</button>
      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </div>
  )
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  const pct = Math.round(value * 100)
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>Activation</span><span>{pct}%</span>
      </div>
      <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function interpretRegion(key: string, value: number): string {
  const pct = Math.round(value * 100)
  if (key === 'nacc') {
    if (pct > 70) return 'Strong reward signaling — viewers are hooked and craving more.'
    if (pct > 40) return 'Moderate reward engagement. Tighten your hook and payoff moments.'
    return 'Low reward activation. Add surprise or anticipation elements.'
  }
  if (key === 'mpfc') {
    if (pct > 70) return 'High personal relevance — content resonates deeply with viewers.'
    if (pct > 40) return 'Average relevance score. Make the content more personally relatable.'
    return 'Viewers aren\'t connecting personally. Revisit your messaging.'
  }
  if (key === 'ains') {
    if (pct > 70) return 'Strong emotional salience — this content will be memorable.'
    if (pct > 40) return 'Moderate salience. Amplify contrast or emotional beats.'
    return 'Low salience. Add stronger emotional triggers or stakes.'
  }
  if (key === 'visual_cortex') {
    if (pct > 70) return 'Visually captivating. Your framing and motion hold attention.'
    if (pct > 40) return 'Average visual stimulus. Improve pacing or visual complexity.'
    return 'Weak visual engagement. Add more dynamic visuals or cuts.'
  }
  if (key === 'amygdala') {
    if (pct > 70) return 'High emotional arousal — triggers strong viewer reactions.'
    if (pct > 40) return 'Some emotional response. Add tension, humor, or surprise.'
    return 'Minimal emotional response. Content may feel flat or neutral.'
  }
  return ''
}

function dominantInterpretation(regions: AnalysisResult['brain_regions_summary']): string {
  if (!regions) return ''
  const entries = Object.entries(regions) as [string, number][]
  entries.sort((a, b) => b[1] - a[1])
  const top = entries[0]
  const region = BRAIN_REGIONS.find((r) => r.key === top[0])
  if (!region) return ''
  return `Your content is dominated by ${region.name} (${region.role}) activation at ${Math.round(top[1] * 100)}%. This means viewers are primarily responding through ${region.description.split('.')[0].toLowerCase()}.`
}

export default function BrainMapPage() {
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

  const regions = result?.brain_regions_summary
  const radarData = regions ? BRAIN_REGIONS.map((r) => ({ region: r.short, value: regions[r.key] })) : []

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar title="Brain Region Map" />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {stage === 'idle' && (
          <div className="max-w-xl mx-auto mt-8">
            <h1 className="text-3xl font-extrabold text-center mb-2">🔬 Brain Region Analysis</h1>
            <p className="text-slate-400 text-center mb-8">See which brain regions your video activates most</p>
            <UploadZone onFile={processFile} />
          </div>
        )}

        {stage === 'uploading' && (
          <div className="max-w-md mx-auto mt-16 text-center space-y-4">
            <div className="text-5xl">📤</div>
            <h2 className="text-xl font-bold">Uploading…</h2>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-600 to-cyan-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-slate-400 text-sm">{progress}%</p>
          </div>
        )}

        {stage === 'processing' && (
          <div className="max-w-md mx-auto mt-16 text-center space-y-4">
            <div className="text-5xl animate-pulse">🧠</div>
            <h2 className="text-xl font-bold">Running Brain Analysis…</h2>
            <p className="text-slate-400 text-sm">Mapping neural activation patterns</p>
            <div className="flex justify-center gap-1 mt-4">
              {[0,1,2].map((i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
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
            {regions ? (
              <>
                {/* Region Cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {BRAIN_REGIONS.map((region) => {
                    const val = regions[region.key]
                    const pct = Math.round(val * 100)
                    return (
                      <div key={region.key} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">{region.icon}</div>
                          <div>
                            <div className="font-bold text-white text-sm">{region.name}</div>
                            <div className="text-xs" style={{ color: region.color }}>{region.role}</div>
                          </div>
                          <div className="ml-auto text-2xl font-black" style={{ color: region.color }}>{pct}%</div>
                        </div>
                        <ScoreBar value={val} color={region.color} />
                        <p className="text-xs text-slate-400 leading-relaxed">{interpretRegion(region.key, val)}</p>
                      </div>
                    )
                  })}
                </div>

                {/* Radar Chart */}
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
                  <h2 className="text-lg font-bold mb-4">🕸️ Full Brain Region Radar</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#334155" />
                      <PolarAngleAxis dataKey="region" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                      <PolarRadiusAxis domain={[0, 1]} tick={{ fill: '#64748b', fontSize: 9 }} />
                      <Radar dataKey="value" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.25} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* What this means */}
                <div className="bg-gradient-to-br from-slate-800/60 to-purple-900/20 border border-purple-500/20 rounded-2xl p-6">
                  <h2 className="text-lg font-bold mb-3">🧩 What This Means</h2>
                  <p className="text-slate-300 text-sm leading-relaxed">{dominantInterpretation(regions)}</p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
                    {BRAIN_REGIONS.map((r) => (
                      <div key={r.key} className="text-center">
                        <div className="text-lg font-black" style={{ color: r.color }}>{Math.round(regions[r.key] * 100)}%</div>
                        <div className="text-xs text-slate-400">{r.short}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="relative bg-slate-800/40 border border-slate-700/30 rounded-2xl p-16 text-center overflow-hidden">
                <div className="absolute inset-0 backdrop-blur-sm bg-slate-950/60 flex flex-col items-center justify-center gap-4">
                  <div className="text-4xl">🔒</div>
                  <h3 className="text-xl font-bold text-white">Brain Map Locked</h3>
                  <p className="text-slate-400 text-sm max-w-sm">Requires full Tribe V2 model. Brain region activation data was not returned by this analysis.</p>
                  <div className="bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2 text-xs text-slate-400">
                    Requires full Tribe V2 model
                  </div>
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
