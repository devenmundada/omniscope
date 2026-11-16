'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { refreshMarketIntelAction } from '@/app/intel-actions';
import { cn } from '@/lib/utils';

export function RefreshIntelButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() =>
          start(async () => {
            const r = await refreshMarketIntelAction();
            if (!r.ok) setError(r.error ?? 'Refresh failed');
            else {
              setError(null);
              router.refresh();
            }
          })
        }
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60"
      >
        <RefreshCw className={cn('size-3.5', pending && 'animate-spin')} aria-hidden />
        {pending ? 'Analysing news…' : 'Refresh'}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
