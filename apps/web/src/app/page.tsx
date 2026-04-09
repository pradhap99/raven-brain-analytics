import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-20">
      {/* Hero */}
      <h1 className="text-5xl md:text-6xl font-extrabold text-center bg-gradient-to-r from-raven-accent via-raven-pink to-raven-accent bg-clip-text text-transparent">
        Raven Brain Analytics
      </h1>
      <p className="text-raven-muted text-lg text-center max-w-xl mb-12">
        Predict how brains react to your IG Reels using Meta&apos;s Tribe V2. Upload a video, get
        neural engagement analytics in seconds.
      </p>

      <Link href="/upload">
        <button className="btn-primary text-lg px-12 py-4">
          Get Started
        </button>
      </Link>

      {/* Feature grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 max-w-4xl w-full">
        {[
          {
            icon: '\ud83c\udfa5',
            title: 'Upload Your Reel',
            desc: 'Drag-and-drop your MP4. We handle the rest.',
            href: '/upload',
          },
          {
            icon: '\u2694\ufe0f',
            title: 'A/B Compare',
            desc: 'Compare two videos side-by-side. See which one wins on engagement, retention, and virality.',
            href: '/compare',
          },
          {
            icon: '\ud83c\udfaf',
            title: 'Hook Optimizer',
            desc: 'Analyze your first 3 seconds. Get scroll-stop scores and optimization tips.',
            href: '/hook-optimizer',
          },
        ].map((f) => (
          <Link
            key={f.title}
            href={f.href}
            className="bg-raven-surface border border-raven-border rounded-2xl p-6 text-center hover:border-purple-500/50 transition-colors"
          >
            <div className="text-4xl mb-3">{f.icon}</div>
            <h3 className="font-semibold text-white mb-2">{f.title}</h3>
            <p className="text-raven-muted text-sm">{f.desc}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 max-w-4xl w-full">
        {[
          {
            icon: '\u26a1',
            title: 'Async Processing',
            desc: 'Jobs run in the background. Poll for status or wait for the result.',
          },
          {
            icon: '\ud83d\udcca',
            title: 'Rich Dashboard',
            desc: 'Timeline charts, section rankings, and AI-generated insights.',
          },
          {
            icon: '\ud83e\udde0',
            title: 'Brain Activation Map',
            desc: 'Visualize which brain regions light up during your content.',
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
        Powered by Meta TRIBE v2 * Built by Raven Labs
      </p>
    </main>
  )
}
