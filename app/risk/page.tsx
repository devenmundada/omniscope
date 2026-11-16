import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/omni/primitives';
import { RiskLabView } from '@/components/risk/risk-lab-view';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { getRiskReport } from '@/lib/db/risk';

export const metadata = { title: 'Risk Lab — OmniScope' };
export const dynamic = 'force-dynamic';

export default async function RiskPage() {
  let signedIn = false;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      signedIn = true;
      const report = await getRiskReport(user.id);
      if (report) return <RiskLabView report={report} />;
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Risk Lab"
        title="How much risk are you really taking?"
        question="Volatility, Value-at-Risk, drawdowns, an efficient-frontier optimiser and crash tests, computed from two years of verified NSE and AMFI prices."
      />
      <Card className="max-w-xl p-6 text-sm leading-relaxed text-muted-foreground">
        {signedIn ? (
          <>
            The Risk Lab needs holdings with verified prices and history. Add holdings on the{' '}
            <Link href="/portfolio" className="font-medium text-primary hover:underline">Portfolio page</Link> and sync prices, then come back.
          </>
        ) : (
          <>
            <Link href="/auth/login?next=%2Frisk" className="font-medium text-primary hover:underline">Sign in</Link> to run the Risk Lab on
            your own portfolio.
          </>
        )}
      </Card>
    </div>
  );
}
