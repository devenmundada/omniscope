'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ensureAlertsFeed, useAlertsFeed, useDismissedAlerts } from './alerts-store';

/** Bell with the number of open "act" and "watch" alerts. Hidden for signed-out visitors. */
export function AlertsBell({ className }: { className?: string }) {
  const pathname = usePathname();
  const feed = useAlertsFeed();
  const dismissed = useDismissedAlerts();

  useEffect(() => {
    ensureAlertsFeed();
  }, [pathname]);

  if (feed.status === 'signed-out' || feed.status === 'idle') return null;
  const open = feed.alerts.filter((a) => a.severity !== 'info' && !dismissed.has(a.id));
  const urgent = open.some((a) => a.severity === 'act');
  return (
    <Link
      href="/alerts"
      aria-label={open.length ? `Alerts: ${open.length} need attention` : 'Alerts'}
      className={cn(
        'relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        pathname === '/alerts' && 'bg-accent text-foreground',
        className
      )}
    >
      <Bell className="size-[18px]" aria-hidden />
      {open.length > 0 && (
        <span
          className={cn(
            'absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-[18px] text-white tnum',
            urgent ? 'bg-[var(--danger)]' : 'bg-amber-500'
          )}
        >
          {open.length > 9 ? '9+' : open.length}
        </span>
      )}
    </Link>
  );
}
