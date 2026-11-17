'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, ArrowRight, Bell } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { Alert } from '@/lib/math/alerts';
import { cn } from '@/lib/utils';
import { primeAlertsFeed, useDismissedAlerts } from './alerts-store';

/** The top three open alerts, for the dashboard. */
export function AlertStrip({ alerts }: { alerts: Alert[] }) {
  const dismissed = useDismissedAlerts();
  useEffect(() => primeAlertsFeed(alerts), [alerts]);
  const open = alerts.filter((a) => a.severity !== 'info' && !dismissed.has(a.id));
  if (open.length === 0) return null;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Bell className="size-4 text-primary" aria-hidden /> Needs your attention
        </h2>
        <Link href="/alerts" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          All {open.length} alerts <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <ul className="mt-3 grid gap-3 md:grid-cols-3">
        {open.slice(0, 3).map((a) => (
          <li key={a.id}>
            <Link href={a.href} className="group block h-full rounded-xl border border-border/70 p-4 transition-colors hover:bg-accent">
              <p className={cn('flex items-center gap-1.5 text-[11px] font-medium', a.severity === 'act' ? 'text-[var(--danger)]' : 'text-amber-700 dark:text-amber-300')}>
                {a.severity === 'act' && <AlertTriangle className="size-3" aria-hidden />}
                {a.severity === 'act' ? 'Act now' : 'Keep an eye on'}
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">{a.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.body}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
