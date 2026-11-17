import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google'
import { AppShell } from '@/components/shell/app-shell'
import { PageTransition } from '@/components/omni/page-transition'
import { SITE_URL } from '@/lib/site'
import './globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument-serif',
  display: 'swap',
})

const description =
  'OmniScope helps Indian investors understand their money: verified NSE and AMFI prices, a Risk Lab with an efficient-frontier optimiser, capital-gains tax planning, Monte Carlo goals and an AI Copilot in English and Hindi.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'OmniScope — Your AI Wealth Operating System', template: '%s' },
  description,
  applicationName: 'OmniScope',
  keywords: ['personal finance', 'India', 'portfolio', 'mutual funds', 'capital gains tax', 'risk', 'Monte Carlo', 'AI copilot'],
  openGraph: { type: 'website', siteName: 'OmniScope', title: 'OmniScope — Your AI Wealth Operating System', description, locale: 'en_IN', url: '/welcome' },
  twitter: { card: 'summary_large_image', title: 'OmniScope — Your AI Wealth Operating System', description },
  appleWebApp: { capable: true, title: 'OmniScope', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbf8' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1c1f' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`bg-background ${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="font-sans antialiased">
        <AppShell>
          <PageTransition>{children}</PageTransition>
        </AppShell>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
