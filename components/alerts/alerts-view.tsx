'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, BellOff, CalendarClock, Database, Eye, HeartPulse, Radar, ReceiptIndianRupee, RotateCcw, Target, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/omni/primitives';
import { StaggerContainer, StaggerItem } from '@/components/omni/page-transition';
import type { Alert, AlertKind, AlertSeverity } from '@/lib/math/alerts';
import { cn } from '@/lib/utils';
import { dismissAlert, primeAlertsFeed, restoreAlert, useDismissedAlerts } from './alerts-store';

const KIND_ICON: Record<AlertKind, LucideIcon> = { tax: ReceiptIndianRupee, risk: Radar, goal: Target, safety: HeartPulse, data: Database };
const KIND_LABEL: Record<AlertKind, string> = { tax: 'Tax', risk: 'Risk', goal: 'Goals', safety: 'Safety net', data: 'Data' };
const SEVERITY: Record<AlertSeverity, { label: string; className: string }> = {
  act: { label: 'Act now', className: 'border-[var(--danger)]/30 bg-[var(--danger)]/10 text-[var(--danger)]' },
  watch: { label: 'Keep an eye on', className: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200' },
  info: { label: 'Good to know', className: 'border-border bg-muted text-muted-foreground' },
};
const dateLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function AlertsView({ alerts, asOf }: { alerts: Alert[]; asOf: string }) {
  const dismissed = useDismissedAlerts();
  const [showDismissed, setShowDismissed] = useState(false);

  // Keep the bell in step with what this page shows.
  useEffect(() => primeAlertsFeed(alerts), [alerts]);

  const open = alerts.filter((a) => !dismissed.has(a.id));
  const hidden = alerts.filter((a) => dismissed.has(a.id));
  const counts = (['act', 'watch', 'info'] as AlertSeverity[]).map((s) => ({ s, n: open.filter((a) => a.severity === s).length }));

  return (
    <div>
      <PageHeader
        eyebrow={`Alerts · ${dateLabel(asOf)}`}
        title={open.some((a) => a.severity === 'act') ? 'A few things need you.' : open.length ? 'Nothing urgent. A few things to watch.' : 'All clear.'}
        question="OmniScope watches your tax dates, concentration, price falls, goals, safety net and data quality, and tells you only what is worth your attention."
      />
      <StaggerContainer className="space-y-6">
        <StaggerItem>
          <div className="flex flex-wrap gap-2">
            {counts.map(({ s, n }) => (
              <span key={s} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs', SEVERITY[s].className)}>
                <span className="font-semibold tnum">{n}</span> {SEVERITY[s].label.toLowerCase()}
              </span>
            ))}
          </div>
        </StaggerItem>

        {open.length === 0 && (
          <StaggerItem>
            <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
              <BellOff className="size-5" /> Nothing needs your attention right now. Alerts are recomputed from your latest prices every time you visit.
            </Card>
          </StaggerItem>
        )}

        <StaggerItem>
          <ul className="space-y-3">
            {open.map((a) => (
              <AlertCard key={a.id} alert={a} onDismiss={() => dismissAlert(a.id)} />
            ))}
          </ul>
        </StaggerItem>

        {hidden.length > 0 && (
          <StaggerItem>
            <button type="button" onClick={() => setShowDismissed((v) => !v)} aria-expanded={showDismissed} className="text-sm text-muted-foreground hover:text-foreground">
              {showDismissed ? 'Hide' : 'Show'} {hidden.length} dismissed alert{hidden.length > 1 ? 's' : ''}
            </button>
            {showDismissed && (
              <ul className="mt-3 space-y-3 opacity-70">
                {hidden.map((a) => (
                  <AlertCard key={a.id} alert={a} onRestore={() => restoreAlert(a.id)} />
                ))}
              </ul>
            )}
          </StaggerItem>
        )}

        <StaggerItem>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Dismissing hides an alert in this browser until the situation changes (a new date, a new financial year, a different holding). Alerts are
            educational prompts from your own data, not investment or tax advice.
          </p>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}

function AlertCard({ alert: a, onDismiss, onRestore }: { alert: Alert; onDismiss?: () => void; onRestore?: () => void }) {
  const Icon = KIND_ICON[a.kind];
  return (
    <li>
      <Card className="flex gap-4 p-5">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl border', SEVERITY[a.severity].className)}>
          {a.severity === 'act' ? <AlertTriangle className="size-5" /> : <Icon className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className={cn('rounded-full border px-2 py-0.5 font-medium', SEVERITY[a.severity].className)}>{SEVERITY[a.severity].label}</span>
            <span>{KIND_LABEL[a.kind]}</span>
            {a.dueDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3" /> by {dateLabel(a.dueDate)}
              </span>
            )}
          </div>
          <h2 className="mt-1.5 text-base font-medium text-foreground">{a.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <Link href={a.href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              <Eye className="size-3.5" /> See the working <ArrowRight className="size-3.5" />
            </Link>
            {onDismiss && (
              <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label={`Dismiss alert: ${a.title}`}>
                Dismiss
              </button>
            )}
            {onRestore && (
              <button type="button" onClick={onRestore} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" aria-label={`Restore alert: ${a.title}`}>
                <RotateCcw className="size-3.5" /> Restore
              </button>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}
