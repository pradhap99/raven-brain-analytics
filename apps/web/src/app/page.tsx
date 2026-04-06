import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-20">
      {/* Hero */}
      <h1 className="text-5xl md:text-6xl font-extrabold text-center bg-gradient-to-r from-raven-accent via-raven-pink to-raven-amber bg-clip-text text-transparent leading-tight mb-4">
        🧠 Raven Brain Analytics
      </h1>
      <p className="text-raven-muted text-lg text-center max-w-xl mb-12">
        Predict how brains react to your IG Reels using Meta&apos;s Tribe V2. Upload a video, get
        neural engagement analytics in seconds.
      </p>

      <Link href="/upload">
        <button className="btn-primary text-lg px-12 py-4">
          Get Started →
        </button>
      </Link>

      {/* Feature grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 max-w-4xl w-full">
        {[
          {
            icon: '🎬',
            title: 'Upload Your Reel',
            desc: 'Drag-and-drop your MP4. We handle the rest.',
          },
          {
            icon: '⚡',
            title: 'Async Processing',
            desc: 'Jobs run in the background. Poll for status or wait for the result.',
          },
          {
            icon: '📊',
            title: 'Rich Dashboard',
            desc: 'Timeline charts, section rankings, and AI-generated insights.',
          },
        ].map((f) => (
          <div
            key={f.title}
            className="bg-raven-surface border border-raven-border rounded-2xl p-6 text-center"
          >
            <div className="text-4xl mb-3">{f.icon}</div>
            <h3 className="font-semibold text-white mb-2">{f.title}</h3>
            <p className="text-raven-muted text-sm">{f.desc}</p>
          </div>
        ))}
      </div>

      <p className="mt-16 text-xs text-raven-border">
        Powered by Meta TRIBE v2 • Built by Raven Labs
      </p>
    </main>
  )
}
