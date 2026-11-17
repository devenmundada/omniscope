import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/omni/primitives';
import { ArchitectureDiagram } from '@/components/landing/architecture-diagram';
import { getPublicStats } from '@/lib/db/public-stats';

export const metadata = { title: 'How OmniScope works — data, models and security' };
export const revalidate = 3600;

const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST' : '—';

const dataSources = [
  { name: 'NSE bhavcopy', what: 'Official end-of-day closing prices for every NSE-listed share and ETF', cadence: 'Daily, after market close', fallback: 'Yahoo Finance daily close' },
  { name: 'AMFI NAVAll file', what: 'Official net asset values for every mutual fund scheme in India', cadence: 'Daily, business days', fallback: 'mfapi.in history for backfill' },
  { name: 'gold-api.com + ECB rate', what: 'International gold price × USD/INR × 1.06 import duty, as a proxy for the IBJA 999 rate', cadence: 'Every sync', fallback: 'open.er-api.com, then Yahoo' },
  { name: 'Google News RSS', what: 'Headlines for each holding, read by the AI market analyst', cadence: 'On demand, cached 6 hours', fallback: 'Market-wide headlines' },
];

const models: Array<{ title: string; formula: string; body: ReactNode }> = [
  {
    title: 'XIRR (money-weighted return)',
    formula: 'Σ CFᵢ / (1 + r)^((dᵢ − d₀)/365) = 0',
    body: 'Solved for r with Newton–Raphson, falling back to bisection when Newton does not converge. Purchases are negative cash flows; today’s verified value is the final positive one.',
  },
  {
    title: 'Goal probability (Monte Carlo)',
    formula: 'Vₜ₊₁ = (Vₜ + SIP) · exp((μₘ − σₘ²/2) + σₘ·Z),  Z ~ N(0, 1)',
    body: '10,000 seeded paths per goal with monthly lognormal returns calibrated to the portfolio’s own history; the probability of success is the share of paths that reach the (inflation-adjusted) target by the deadline.',
  },
  {
    title: 'Concentration (HHI)',
    formula: 'HHI = Σ (100 · wᵢ)²',
    body: 'Herfindahl–Hirschman index of verified weights: under 1,500 is diversified, 1,500–2,500 moderately concentrated, above 2,500 concentrated.',
  },
  {
    title: 'Financial health score',
    formula: 'Score = Σ wₖ · pillarₖ  (25% emergency fund, 20% savings, 20% diversification, 15% protection, 20% goals)',
    body: 'Each pillar is scored 0–100 from measured inputs; weights are re-normalised over the pillars that can be assessed, and coverage is shown alongside the score.',
  },
  {
    title: 'Risk metrics',
    formula: 'σ = sd(rₚ)·√252   Sharpe = (CAGR − r_f)/σ   β = cov(rₚ, r_N)/var(r_N)   VaR₉₅ = −Q₀.₀₅(rₚ)',
    body: 'Computed on aligned daily returns over two years, with a 6% risk-free rate. VaR and CVaR are historical (1-day and overlapping 21-day windows); drawdown is measured from each running peak.',
  },
  {
    title: 'Risk contribution',
    formula: 'RCᵢ = wᵢ (Σw)ᵢ / (wᵀΣw)',
    body: 'Euler decomposition of portfolio variance: each holding’s share of total risk, which sums to 100% and often differs sharply from its share of money.',
  },
  {
    title: 'Shrunk covariance (Ledoit–Wolf 2004)',
    formula: 'Σ̂ = δ·m·I + (1 − δ)·S,   δ = min(b², d²)/d²',
    body: 'Shrinks the sample covariance S towards a scaled identity with the analytically optimal intensity δ, which keeps the optimiser stable when observations are limited.',
  },
  {
    title: 'Expected returns',
    formula: 'μᵢ = h · μᵢ^hist + (1 − h) · μᵢ^prior,   h = years / (years + 5)',
    body: 'Historical means are shrunk towards long-run asset-class returns (equity 12%, funds 11%, gold 8%, deposits 7%); the prior is chosen by what a holding tracks, measured by its regression on gold and the Nifty.',
  },
  {
    title: 'Portfolio optimiser (Markowitz)',
    formula: 'max  μᵀw − (γ/2) wᵀΣ̂w   s.t.  Σwᵢ = 1,  0 ≤ wᵢ ≤ cap',
    body: 'Solved by FISTA (accelerated projected gradient) with exact projection onto the capped simplex. Sweeping γ traces the efficient frontier; the maximum-Sharpe portfolio is refined by golden-section search.',
  },
  {
    title: 'Goal-based optimiser',
    formula: 'w*(goal) = argmax over frontier w of  P( V_T(w) ≥ target ),  V by monthly lognormal Monte Carlo',
    body: 'For every efficient-frontier portfolio, each goal’s corpus and SIP are simulated (common random numbers, the Goals page’s seeds) and the mix with the highest probability is chosen, per goal and for all goals together (highest average or best weakest goal), with the SIP needed for 80%. After Das, Markowitz, Scheid and Statman (2010).',
  },
  {
    title: 'Capital-gains tax',
    formula: 'Tax = 1.04 × [0.20·STCG_eq + 0.125·max(0, LTCG_eq − 1.25 L) + 0.125·LTCG_other + slab·STCG_other]',
    body: 'Rules in force since 23 July 2024. Losses are set off in the order that minimises tax (long-term losses only against long-term gains). Holdings turn long-term the day after 12 months (24 for unlisted funds); debt funds bought from April 2023 are always taxed at the slab rate; Gold Bonds redeemed with RBI are exempt.',
  },
  {
    title: 'Crash tests',
    formula: 'rᵢ = aᵢ + βᵢᴺ·r_Nifty + βᵢᴳ·r_Gold + εᵢ   →   Δᵢ = βᵢᴺ·shockᴺ + βᵢᴳ·shockᴳ',
    body: 'Two-factor OLS betas from daily returns translate a market scenario into each holding’s move. Recovery time is ln(1/(1+loss)) / ln(1+μₚ).',
  },
];

const limits = [
  'Prices are end-of-day closes, not live quotes.',
  'Sovereign Gold Bonds are valued with a gold reference estimate and use Gold BeES returns as their daily history; the official IBJA rate can differ by a few per cent.',
  'Mean-variance optimisation is sensitive to expected-return estimates; shrinkage and caps reduce, but do not remove, estimation error. It ignores tax and exit loads.',
  'Crash tests are linear: in real panics correlations rise, so losses can be larger.',
  'The AI explains and calculates; it does not give personalised buy or sell advice. OmniScope is not a SEBI-registered adviser.',
];

export default async function MethodologyPage() {
  const stats = await getPublicStats();
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="How OmniScope works"
        title="Every number, traceable to its source."
        question="Where the data comes from, how each model is calculated, how the AI is kept honest, and how your data is protected."
      />

      <section>
        <SectionTitle title="Architecture" subtitle="A daily pipeline from official sources to the analysis on your screen." />
        <div className="mt-5">
          <ArchitectureDiagram />
        </div>
      </section>

      <section>
        <SectionTitle title="Data sources" subtitle="Official sources first, with a fallback chain so one outage never freezes your valuation." />
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {dataSources.map((d) => (
            <Card key={d.name} className="p-5">
              <p className="font-semibold">{d.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{d.what}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Refresh:</span> {d.cadence} · <span className="font-medium text-foreground">Fallback:</span> {d.fallback}
              </p>
            </Card>
          ))}
        </div>
        {stats && (
          <Card className="mt-3 overflow-x-auto p-5">
            <p className="text-sm font-medium">Live status</p>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Source in use</th>
                  <th className="py-2 text-right font-medium">Instruments</th>
                  <th className="py-2 text-right font-medium">Latest price</th>
                </tr>
              </thead>
              <tbody>
                {stats.sources.map((s) => (
                  <tr key={s.source} className="border-b border-border/60">
                    <td className="py-2">{s.label}</td>
                    <td className="py-2 text-right tnum">{s.instruments}</td>
                    <td className="py-2 text-right tnum text-muted-foreground">{dateTime(s.latest)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              {stats.historyRows.toLocaleString('en-IN')} daily prices stored; {stats.tradingDays} trading days of Nifty 50 history
              {stats.historyFrom ? ` since ${new Date(stats.historyFrom).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : ''}.
              Bonus and split days are detected from the price ratio and removed, because NSE&rsquo;s file does not adjust previous closes.
            </p>
          </Card>
        )}
      </section>

      <section>
        <SectionTitle title="Models and formulas" subtitle="Implemented from scratch in TypeScript and covered by unit tests against closed-form results." />
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {models.map((m) => (
            <Card key={m.title} className="p-5">
              <p className="font-semibold">{m.title}</p>
              <p className="mt-3 overflow-x-auto rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs text-foreground">{m.formula}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{m.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="How the AI is kept honest" />
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>The Copilot answers by calling twelve tools that read your verified data or run the engines above; it is told never to state a figure a tool can provide.</li>
            <li>The Statement Reader returns a schema-validated object (Zod), and every extracted holding is matched to the catalogue by ISIN before you confirm it.</li>
            <li>Market summaries cite headline IDs that are checked against the fetched news; IDs never leak into the text.</li>
            <li>Gemini 3.5 Flash-Lite with a 3.1 Flash-Lite fallback, a time budget per model, and no slow retries, so an answer or a clear error always arrives.</li>
            <li>Guardrails: education and analysis only, no buy or sell recommendations, no price predictions.</li>
            <li>Hindi mode answers in Devanagari with Western digits and ₹ लाख/करोड़, so the same benchmark checks Hindi answers for exact figures.</li>
          </ul>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Security and privacy" />
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Sign-in through Supabase Auth; every database query for personal data is scoped to the signed-in user.</li>
            <li>Database access, API keys and AI calls run only on the server (Next.js server components and routes in Mumbai).</li>
            <li>No broker passwords are ever requested: holdings come from your statements or manual entry.</li>
            <li>The scheduled price job is protected by a secret; uploaded statements are processed in memory and not stored.</li>
          </ul>
        </Card>
      </section>

      <section>
        <SectionTitle title="Known limitations" subtitle="Stated plainly, because a model is only useful if you know where it stops." />
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
          {limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="mt-6 text-sm">
          The <Link href="/evaluation" className="font-medium text-primary hover:underline">Evaluation</Link> page measures the AI and the optimiser
          against known answers. See it on your own portfolio in the <Link href="/risk" className="font-medium text-primary hover:underline">Risk Lab</Link>, or ask the{' '}
          <Link href="/mentor" className="font-medium text-primary hover:underline">AI Copilot</Link> to explain any number.
        </p>
      </section>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
