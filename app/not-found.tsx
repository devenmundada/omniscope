import Link from 'next/link';
import { Compass } from 'lucide-react';

export const metadata = { title: 'Page not found — OmniScope' };

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Compass className="size-6" aria-hidden />
      </div>
      <p className="mt-6 text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-1 font-serif text-4xl tracking-tight text-foreground">This page isn&rsquo;t on the map.</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">The link may be old, or the page may have moved. Everything else is where you left it.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
        <Link href="/" className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Go to the dashboard</Link>
        <Link href="/methodology" className="rounded-lg border border-border px-4 py-2 font-medium hover:bg-accent">How OmniScope works</Link>
      </div>
    </div>
  );
}
