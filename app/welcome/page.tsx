import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Bot, Compass, FileScan, HeartPulse, LineChart, Newspaper, Radar, ReceiptIndianRupee, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { HeroFrontier } from '@/components/landing/hero-frontier';
import { ArchitectureDiagram } from '@/components/landing/architecture-diagram';
import { getPublicStats } from '@/lib/db/public-stats';
import { efficientFrontier, evaluate, frontierAtVolatility, randomPortfolios } from '@/lib/math/optimizer';

export const metadata = { title: 'OmniScope — See your money the way a risk desk does' };
export const revalidate = 3600;

// Illustrative long-run assumptions for five Indian asset classes (not user data).
const SAMPLE_MU = [0.12, 0.15, 0.08, 0.07, 0.11];
const SAMPLE_VOL = [0.16, 0.22, 0.14, 0.03, 0.18];
const SAMPLE_CORR = [
  [1, 0.85, -0.05, 0.05, 0.55],
  [0.85, 1, -0.05, 0.05, 0.5],
  [-0.05, -0.05, 1, 0.1, 0.05],
  [0.05, 0.05, 0.1, 1, 0.0],
  [0.55, 0.5, 0.05, 0.0, 1],
];

function heroData() {
  const cov = SAMPLE_CORR.map((row, i) => row.map((c, j) => c * SAMPLE_VOL[i] * SAMPLE_VOL[j]));
  const f = efficientFrontier(SAMPLE_MU, cov, 0.06, 1, 28);
  const cloud = randomPortfolios(SAMPLE_MU, cov, 0.06, 260, 11).map((p) => ({ x: p.volatility, y: p.expectedReturn }));
  // Mostly large-cap shares plus deposits, no gold: a common Indian retail mix.
  const current = evaluate([0.7, 0.1, 0, 0.2, 0], SAMPLE_MU, cov, 0.06);
  const best = frontierAtVolatility(SAMPLE_MU, cov, 0.06, 1, current.volatility);
  return {
    gap: best.expectedReturn - current.expectedReturn,
    cloud,
    frontier: f.points.map((p) => ({ x: p.volatility, y: p.expectedReturn })),
    current: { x: current.volatility, y: current.expectedReturn },
    best: { x: best.volatility, y: best.expectedReturn },
  };
}

const features: Array<{ icon: LucideIcon; title: string; body: string; href: string }> = [
  { icon: FileScan, title: 'AI statement reader', body: 'Upload a broker or CAS statement (PDF or CSV). Gemini extracts every holding, quantity, cost and date, and matches each one to the catalogue by ISIN.', href: '/portfolio' },
  { icon: ShieldCheck, title: 'Verified prices only', body: 'Holdings are valued at official NSE closing prices and AMFI NAVs, with two years of daily history cleaned for bonuses and splits. Unverified prices are never used.', href: '/methodology' },
  { icon: Radar, title: 'Risk Lab and crash tests', body: 'Volatility, worst drawdown, 95% Value-at-Risk in rupees, beta to the Nifty 50, each holding’s share of your risk, and a 2008- or 2020-style crash replayed on today’s holdings.', href: '/risk' },
  { icon: Compass, title: 'Portfolio optimiser', body: 'A Markowitz efficient frontier over your own holdings with shrunk covariance and position caps: see the mix that earns more for the same risk.', href: '/risk' },
  { icon: ReceiptIndianRupee, title: 'Capital-gains tax centre', body: 'Tax if you sold today under the 2024 rules, days until each holding turns long-term, and how to book ₹1.25 lakh of gains tax-free each year.', href: '/tax' },
  { icon: Target, title: 'Goals by Monte Carlo', body: '10,000 simulated market paths per goal give the real probability of reaching it, and what an extra SIP would change.', href: '/goals' },
  { icon: Bot, title: 'AI Copilot', body: 'Ask in plain English. The Copilot answers by calling fourteen tools on your verified data, so every number it quotes comes from a calculation.', href: '/mentor' },
  { icon: HeartPulse, title: 'Financial health score', body: 'Emergency fund, savings rate, diversification, insurance and goal progress, weighted into one score with the next best fix.', href: '/health' },
  { icon: Newspaper, title: 'Market news, explained', body: 'Today’s headlines for the shares and funds you own, with what happened, why, and whether it matters to you.', href: '/market' },
];

const steps = [
  { n: '01', title: 'Import', body: 'Add holdings by hand, CSV, or let the AI read your statement.' },
  { n: '02', title: 'Verify', body: 'Every price comes from an official exchange or AMFI feed.' },
  { n: '03', title: 'Analyse', body: 'Risk, health, goals and performance are computed, not guessed.' },
  { n: '04', title: 'Ask', body: 'The Copilot explains it all and runs what-ifs on request.' },
];

const dateLabel = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const stats = await getPublicStats();
  const hero = heroData();
  const nse = stats?.sources.find((s) => s.source === 'NSE_EOD');
  const amfi = stats?.sources.find((s) => s.source === 'AMFI');

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/welcome" className="flex items-center gap-2.5" aria-label="OmniScope home">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">OmniScope</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-2">
            <Link href="/methodology" className="hidden rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground sm:inline-block">How it works</Link>
            <Link href="/demo" className="hidden rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground sm:inline-block">Sample dashboard</Link>
            <Link href="/auth/login" className="rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground">Sign in</Link>
            <Link href="/auth/sign-up" className="rounded-lg bg-primary px-3.5 py-2 font-medium text-primary-foreground hover:bg-primary/90">Get started</Link>
          </nav>
        </div>
      </header>
      {deleted === '1' && (
        <div role="status" className="border-b border-border bg-muted/60">
          <p className="mx-auto max-w-6xl px-4 py-3 text-sm text-foreground sm:px-6">
            Your account and all its data have been permanently deleted. Thank you for trying OmniScope.
          </p>
        </div>
      )}

      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklch,var(--chart-1)_14%,transparent),transparent_60%)]" />
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-[var(--success)]" />
                AI wealth operating system for Indian investors
              </p>
              <h1 className="mt-5 font-serif text-5xl leading-[1.02] tracking-tight text-balance sm:text-6xl">
                See your money the way a risk desk does.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
                OmniScope reads your statements with AI, values every holding at official NSE and AMFI prices, and runs institutional
                models (Value-at-Risk, Markowitz optimisation, Monte Carlo) on your own portfolio. Then it explains them in plain English.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/auth/sign-up" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90">
                  Create a free account <ArrowRight className="size-4" />
                </Link>
                <Link href="/demo" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-medium hover:bg-accent">
                  Explore a sample dashboard
                </Link>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Free. No broker login needed. Educational tool, not investment advice.</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-sm font-medium">Efficient frontier</p>
                <p className="text-xs text-muted-foreground">computed live by OmniScope&rsquo;s optimiser</p>
              </div>
              <HeroFrontier cloud={hero.cloud} frontier={hero.frontier} current={hero.current} best={hero.best} />
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Grey dots are random mixes of five Indian asset classes; the blue curve is the best return possible at each level of risk. A
                typical mix of large-cap shares and deposits (red) gives up about {(hero.gap * 100).toFixed(1)}% a year against the best mix
                with the same risk (green), using illustrative long-run assumptions. The Risk Lab measures the gap on your real portfolio.
              </p>
            </div>
          </div>
        </section>

        {stats && (
          <section className="border-y border-border bg-card/60">
            <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-5">
              <LiveStat label="Latest NSE close" value={dateLabel(nse?.latest)} />
              <LiveStat label="Latest AMFI NAV" value={dateLabel(amfi?.latest)} />
              <LiveStat label="Daily prices stored" value={stats.historyRows.toLocaleString('en-IN')} />
              <LiveStat label="Trading days of history" value={String(stats.tradingDays)} />
              <LiveStat label="Instruments tracked" value={String(stats.instruments)} />
            </dl>
          </section>
        )}

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="text-sm font-medium text-primary">What it does</p>
          <h2 className="mt-2 max-w-2xl font-serif text-4xl tracking-tight text-balance">Institutional-grade analysis, on the portfolio you actually own.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Link key={f.title} href={f.href} className="group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/40">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-card/60">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="text-sm font-medium text-primary">How it works</p>
            <h2 className="mt-2 max-w-2xl font-serif text-4xl tracking-tight text-balance">From statement to strategy in four steps.</h2>
            <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s) => (
                <li key={s.n} className="border-t-2 border-primary/30 pt-4">
                  <p className="font-mono text-xs text-muted-foreground">{s.n}</p>
                  <p className="mt-1 text-lg font-semibold">{s.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-14">
              <ArchitectureDiagram />
            </div>
            <Link href="/methodology" className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              Read the full methodology: data sources, every formula, and security <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <LineChart className="mx-auto size-8 text-primary" aria-hidden />
          <h2 className="mx-auto mt-4 max-w-2xl font-serif text-4xl tracking-tight text-balance">Know what you own, what it risks, and what to do next.</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/auth/sign-up" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Get started free <ArrowRight className="size-4" />
            </Link>
            <Link href="/auth/login" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-medium hover:bg-accent">
              Sign in
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} OmniScope. An educational tool, not a SEBI-registered investment adviser.</p>
          <p>
            <Link href="/methodology" className="hover:text-foreground">Methodology</Link>
            <span className="mx-2">·</span>
            <Link href="/demo" className="hover:text-foreground">Sample dashboard</Link>
            <span className="mx-2">·</span>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

function LiveStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-serif text-2xl tnum tracking-tight">{value}</dd>
    </div>
  );
}
