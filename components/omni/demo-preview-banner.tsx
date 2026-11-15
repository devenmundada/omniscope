import { AlertCircle, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

export function DemoPreviewBanner({ screenName }: { screenName?: string }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground">
      <AlertCircle className="size-4 shrink-0 text-primary mt-0.5" />
      <div className="flex-1 leading-relaxed">
        <span className="font-semibold text-foreground">Reference Dataset Preview:</span> The analytics on this {screenName || 'screen'} are currently demonstrating OmniScope&rsquo;s analytical engine using a reference portfolio. Your real holdings and cost basis are tracked independently on your Portfolio page.
      </div>
      <Link
        href="/portfolio"
        className="inline-flex items-center gap-1 font-medium text-primary hover:underline shrink-0 text-xs"
      >
        View Your Real Portfolio <ArrowUpRight className="size-3" />
      </Link>
    </div>
  );
}
