import { Skeleton } from '@/components/ui/skeleton';

/** Shown instantly while a page's server-side figures are being computed. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-4 h-12 w-3/4 max-w-xl" />
      <Skeleton className="mt-3 h-4 w-full max-w-lg" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-72 rounded-xl" />
    </div>
  );
}
