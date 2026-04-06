import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Raven Brain Analytics',
  description: 'Predict how brains react to your IG Reels using Meta\'s Tribe V2',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-raven-bg text-raven-text min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
