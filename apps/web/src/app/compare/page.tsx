'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import { signUpload, uploadFile, createJob, pollJob, getResult } from '@/lib/api'
import type { AnalysisResult } from '@/types/schema'

const C = {
  accent: '#6C5CE7', green: '#00B894', red: '#FF6B6B', amber: '#FDCB6E',
  blue: '#74B9FF', pink: '#FD79A8', cyan: '#00CEC9',
}

const pct = (v: number | undefined | null) =>
  v != null && !isNaN(v) ? `${Math.round(v * 100)}%` : '---'

const safe = (v: number | undefined | null, fallback = 0) =>
  v != null && !isNaN(v) ? v : fallback

type UploadState = {
  file: File | null
  status: 'idle' | 'uploading' | 'processing' | 'done' | 'error'
  progress: number
  jobId: string | null
  result: AnalysisResult | null
  error: string | null
}

const initUpload: UploadState = { file: null, status: 'idle', progress: 0, jobId: null, result: null, error: null }

function DropZone({ label, color, state, onFile }: {
  label: string; color: string; state: UploadState; onFile: (f: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }, [onFile])
  const borderColor = color === 'purple' ? 'border-purple-500' : 'border-cyan-500'
  const textColor = color === 'purple' ? 'text-purple-400' : 'text-cyan-400'
  const bgHover = color === 'purple' ? 'hover:bg-purple-500/5' : 'hover:bg-cyan-500/5'
  if (state.status === 'uploading') return (
    <div className={`border-2 border-dashed ${borderColor} rounded-2xl p-8 text-center`}>
      <p className={`text-sm font-semibold ${textColor} mb-3`}>{label}</p>
      <p className="text-xs text-slate-400 mb-2">Uploading {state.file?.name}...</p>
      <div className="w-full bg-white/10 rounded-full h-2"><div className="h-2 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all" style={{ width: `${state.progress}%` }} /></div>
      <p className="text-xs text-slate-500 mt-2">{state.progress}%</p>
    </div>
  )
  if (state.status === 'processing') return (
    <div className={`border-2 border-dashed ${borderColor} rounded-2xl p-8 text-center`}>
      <p className={`text-sm font-semibold ${textColor} mb-3`}>{label}</p>
      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
      <p className="text-xs text-slate-400">Analyzing brain engagement...</p>
    </div>
  )
  if (state.status === 'done') return (
    <div className={`border-2 ${borderColor} rounded-2xl p-8 text-center bg-white/[0.02]`}>
      <p className={`text-sm font-semibold ${textColor} mb-2`}>{label}</p>
      <p className="text-green-400 text-2xl mb-1">\u2713</p>
      <p className="text-xs text-slate-400">{state.file?.name}</p>
      <p className="text-xs text-green-400 mt-1">Analysis complete</p>
    </div>
  )
  if (state.status === 'error') return (
    <div className="border-2 border-dashed border-red-500 rounded-2xl p-8 text-center">
      <p className={`text-sm font-semibold ${textColor} mb-2`}>{label}</p>
      <p className="text-xs text-red-400">{state.error}</p>
    </div>
  )
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => ref.current?.click()}
      className={`border-2 border-dashed ${drag ? borderColor : 'border-white/10'} rounded-2xl p-8 text-center cursor-pointer ${bgHover} transition-all`}
    >
      <input ref={ref} type="file" accept="video/*,image/*,.pdf,.doc,.docx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]) }} />
      <p className="text-3xl mb-3">{color === 'purple' ? '\uD83C\uDFA5' : '\uD83C\uDFAC'}</p>
      <p className={`text-sm font-semibold ${textColor} mb-1`}>{label}</p>
      <p className="text-xs text-slate-500">Drag & drop or click to browse</p>
      <p className="text-[10px] text-slate-600 mt-2">MP4, MOV, AVI, WebM, Images, PDF</p>
    </div>
  )
}

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

async function processFile(file: File, setState: (fn: (prev: UploadState) => UploadState) => void) {
  try {
    setState(s => ({ ...s, file, status: 'uploading', progress: 0, error: null }))
    const sign = await signUpload(file.name, file.type, file.size)
    await uploadFile(file, sign.upload_url, sign.object_key, (pct) => {
      setState(s => ({ ...s, progress: pct }))
    })
    setState(s => ({ ...s, status: 'processing' }))
    const job = await createJob(sign.object_key, file.name, file.size)
    setState(s => ({ ...s, jobId: job.job_id }))
    let status = job.status
    while (status !== 'completed' && status !== 'failed') {
      await new Promise(r => setTimeout(r, 1500))
      const poll = await pollJob(job.job_id)
      status = poll.status
    }
    if (status === 'failed') {
      setState(s => ({ ...s, status: 'error', error: 'Analysis failed' }))
      return
    }
    const result = await getResult(job.job_id)
    setState(s => ({ ...s, status: 'done', result }))
  } catch (e: any) {
    setState(s => ({ ...s, status: 'error', error: e?.message || 'Upload failed' }))
  }
}

function CompareContent() {
  const router = useRouter()
  const [stateA, setStateA] = useState<UploadState>({ ...initUpload })
  const [stateB, setStateB] = useState<UploadState>({ ...initUpload })
  const bothDone = stateA.status === 'done' && stateB.status === 'done'
  const resultA = stateA.result
  const resultB = stateB.result

  const handleReset = () => {
    setStateA({ ...initUpload })
    setStateB({ ...initUpload })
  }

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white">
      <header className="sticky top-0 z-50 bg-[#0d0d1a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center font-black text-sm">R</div>
            <span className="font-semibold text-sm">A/B Compare</span>
          </div>
          <div className="flex gap-3">
            {bothDone && <button onClick={handleReset} className="text-slate-400 hover:text-white text-sm">New comparison</button>}
            <button onClick={() => router.push('/upload')} className="text-slate-400 hover:text-white text-sm">Upload</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {!bothDone && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">A/B Compare</h1>
              <p className="text-slate-400">Upload two videos to compare their brain engagement side by side</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DropZone label="Video A" color="purple" state={stateA} onFile={(f) => processFile(f, setStateA)} />
              <DropZone label="Video B" color="cyan" state={stateB} onFile={(f) => processFile(f, setStateB)} />
            </div>
          </>
        )}

        {bothDone && resultA && resultB && (() => {
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
            <>
              <div className="text-center">
                <h1 className="text-2xl font-bold mb-2">Side-by-Side Comparison</h1>
                <div className="flex justify-center gap-4 text-sm">
                  <span className="text-purple-400">A: {resultA.input?.filename || 'Video A'}</span>
                  <span className="text-slate-500">vs</span>
                  <span className="text-cyan-400">B: {resultB.input?.filename || 'Video B'}</span>
                </div>
              </div>
              <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <CompareMetric icon="\uD83C\uDFC6" label="Grade" valA={a.overall_grade || '---'} valB={b.overall_grade || '---'} />
                <CompareMetric icon="\uD83E\uDDE0" label="Avg Engagement" valA={pct(a.predicted_attention)} valB={pct(b.predicted_attention)} />
                <CompareMetric icon="\u26A1" label="Peak Activation" valA={pct(a.peak_activation)} valB={pct(b.peak_activation)} />
                <CompareMetric icon="\uD83D\uDD25" label="Virality" valA={pct(a.virality_score)} valB={pct(b.virality_score)} />
                <CompareMetric icon="\uD83D\uDD04" label="Retention" valA={pct(safe(a.predicted_retention_pct / 100))} valB={pct(safe(b.predicted_retention_pct / 100))} />
                <CompareMetric icon="\uD83D\uDCA1" label="CTA Strength" valA={pct(a.cta_strength)} valB={pct(b.cta_strength)} />
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
            </>
          )
        })()}

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
