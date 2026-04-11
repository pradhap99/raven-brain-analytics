import Link from 'next/link'

const FEATURES = [
  {
    icon: '🧠',
    title: 'Single Video Analysis',
    desc: 'Deep-dive into one video — engagement timeline, brain regions, emotional arc, retention, and AI insights all in one view.',
    href: '/dashboard',
    accent: '#a855f7',
  },
  {
    icon: '⚖️',
    title: 'A/B Compare',
    desc: 'Upload two videos side-by-side and see exactly which one wins across every neural metric.',
    href: '/compare',
    accent: '#06b6d4',
  },
  {
    icon: '🔬',
    title: 'Brain Region Map',
    desc: 'Visualize which of the 5 key brain regions (NAcc, mPFC, Insula, Visual Cortex, Amygdala) your content activates most.',
    href: '/brain-map',
    accent: '#ec4899',
  },
  {
    icon: '💜',
    title: 'Emotional Arc',
    desc: 'Trace the second-by-second emotional journey through your video — valence, arousal, and dominant emotion labels.',
    href: '/emotional-arc',
    accent: '#a855f7',
  },
  {
    icon: '📉',
    title: 'Retention Predictor',
    desc: 'See the predicted retention curve, spot drop-off points, and get actionable recommendations to keep viewers watching.',
    href: '/retention',
    accent: '#22c55e',
  },
  {
    icon: '🎬',
    title: 'Pacing Analysis',
    desc: 'Measure scene count, avg scene duration, visual change rate, and rhythm consistency against IG Reels best practices.',
    href: '/pacing',
    accent: '#f59e0b',
  },
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Navbar */}
      <div className="bg-slate-800/50 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold">R</div>
          <span className="font-semibold text-lg">Raven Brain Analytics</span>
        </div>
        <Link href="/upload">
          <button className="btn-primary text-sm py-2 px-4">Upload Video</button>
        </Link>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-20">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-extrabold bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400 bg-clip-text text-transparent leading-tight mb-4">
            🧠 Raven Brain Analytics
          </h1>
          <p className="text-slate-400 text-xl max-w-2xl mx-auto mb-8">
            Powered by Meta TRIBE v2 Neural Intelligence
          </p>
          <p className="text-slate-500 text-base max-w-xl mx-auto mb-10">
            Predict how brains react to your IG Reels. Upload a video and get deep neural engagement analytics — engagement timelines, brain region activation, emotional arcs, retention curves, and AI-generated insights.
          </p>
          <Link href="/upload">
            <button className="btn-primary text-lg px-12 py-4">
              🚀 Get Started
            </button>
          </Link>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {FEATURES.map((f) => (
            <Link key={f.href} href={f.href}>
              <div className="group bg-slate-800/60 border border-slate-700/50 hover:border-slate-500/50 rounded-2xl p-6 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg h-full">
                <div className="flex items-start justify-between mb-4">
                  <div className="text-3xl">{f.icon}</div>
                  <span className="text-slate-500 group-hover:text-slate-300 transition-colors text-lg">→</span>
                </div>
                <h3 className="font-bold text-white text-lg mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
                <div className="mt-4 h-0.5 rounded-full w-0 group-hover:w-full transition-all duration-300" style={{ backgroundColor: f.accent }} />
              </div>
            </Link>
          ))}
        </div>

        {/* Model Status Badge */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/50 rounded-2xl px-6 py-4">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-sm text-slate-300 font-medium">CLIP Backbone Mode</span>
            <span className="text-xs text-slate-500">·</span>
            <span className="text-xs text-slate-500">Brain region & emotional arc require full Tribe V2</span>
          </div>
          <a
            href="#"
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            Upgrade to full Tribe V2 model →
          </a>
        </div>
      </div>

      <div className="text-center pb-8">
        <p className="text-xs text-slate-600">
          Powered by Meta TRIBE v2 • Built by Raven Labs
        </p>
      </div>
    </main>
  )
}
