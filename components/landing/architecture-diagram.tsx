import { ArrowDown, ArrowRight, Bot, Cpu, Database, Globe, MonitorSmartphone, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const stages: Array<{ icon: LucideIcon; title: string; items: string[] }> = [
  { icon: Globe, title: 'Sources', items: ['NSE bhavcopy (official closes)', 'AMFI NAV file', 'Gold & USD/INR feeds', 'Google News RSS', 'Your statements (PDF/CSV)'] },
  { icon: Workflow, title: 'Ingestion', items: ['Daily Vercel cron', 'Bonus & split cleaning', 'Fallback chain per source', 'AI statement extraction'] },
  { icon: Database, title: 'Storage', items: ['Postgres on Supabase (Mumbai)', 'Per-user row isolation', '2-year daily price history', 'AI insight cache'] },
  { icon: Cpu, title: 'Engines', items: ['XIRR (Newton–Raphson)', 'Monte Carlo goals', 'Risk: VaR, beta, drawdown', 'Markowitz optimiser'] },
  { icon: Bot, title: 'AI layer', items: ['Gemini with 10 tools', 'Grounded in your data', 'Model fallback & time budgets', 'Advice guardrails'] },
  { icon: MonitorSmartphone, title: 'You', items: ['Dashboard & Risk Lab', 'Goals & health score', 'Copilot chat', 'Market news, explained'] },
];

/** The OmniScope data pipeline, left to right on wide screens and top to bottom on phones. */
export function ArchitectureDiagram() {
  return (
    <ol
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] xl:items-stretch"
      aria-label="OmniScope architecture, from data sources to the user"
    >
      {stages.map((s, i) => (
        <li key={s.title} className="contents">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="size-4" aria-hidden />
              </span>
              <p className="text-sm font-semibold text-foreground">{s.title}</p>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs leading-snug text-muted-foreground">
              {s.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </div>
          {i < stages.length - 1 && (
            <div className="flex items-center justify-center text-muted-foreground sm:hidden xl:flex" aria-hidden>
              <ArrowDown className="size-4 xl:hidden" />
              <ArrowRight className="hidden size-4 xl:block" />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
