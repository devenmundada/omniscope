'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center" role="alert">
      <div className="flex size-12 items-center justify-center rounded-xl bg-[var(--danger)]/10 text-[var(--danger)]">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h1 className="mt-6 font-serif text-4xl tracking-tight text-foreground">Something went wrong here.</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        This page hit an error while loading. Your data is safe: nothing was changed. Trying again usually works; if a data provider is briefly down, give it a
        minute.
      </p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-muted-foreground">Reference: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
        <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
          <RotateCcw className="size-4" aria-hidden /> Try again
        </button>
        <Link href="/" className="rounded-lg border border-border px-4 py-2 font-medium hover:bg-accent">Dashboard</Link>
      </div>
    </div>
  );
}
