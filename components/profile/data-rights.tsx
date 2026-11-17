'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Download, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { deleteAccountAction } from '@/app/profile/data-actions';

export function DataRights() {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(deleteAccountAction, null);
  return (
    <Card className="mt-8 p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="size-5 text-primary" aria-hidden /> Your data, your rights
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Under India&rsquo;s Digital Personal Data Protection Act, 2023 you can see everything OmniScope holds about you and have it erased. Read the{' '}
        <Link href="/privacy" className="font-medium text-primary hover:underline">privacy notice</Link> for what is stored and why.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a href="/api/export" className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent" download>
          <Download className="size-4" aria-hidden /> Download all my data (JSON)
        </a>
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--danger)]/40 px-4 py-2 text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger)]/10"
          >
            <Trash2 className="size-4" aria-hidden /> Delete my account
          </button>
        )}
      </div>
      {confirming && (
        <form action={action} className="mt-5 max-w-xl rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/5 p-4">
          <p className="text-sm font-medium text-foreground">This permanently deletes your account and everything in it.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Holdings, transactions, goals, profile, Copilot conversations and cached insights are erased at once and cannot be recovered. Download your data first
            if you want a copy.
          </p>
          <label htmlFor="confirm-delete" className="mt-3 block text-xs text-muted-foreground">
            Type <span className="font-mono font-semibold text-foreground">DELETE</span> to confirm
          </label>
          <input id="confirm-delete" name="confirm" autoComplete="off" className="mt-1 h-9 w-48 rounded-md border border-border bg-background px-2 text-sm" />
          {state?.error && (
            <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
              {state.error}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Delete everything
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-accent">
              Cancel
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
