import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/omni/primitives';
import { TaxCentreView } from '@/components/tax/tax-centre-view';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { getTaxCentreData } from '@/lib/db/tax';

export const metadata = { title: 'Tax Centre — OmniScope' };
export const dynamic = 'force-dynamic';

export default async function TaxPage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const data = await getTaxCentreData(user.id);
      if (data.holdings.length > 0) return <TaxCentreView data={data} />;
    }
  }
  return (
    <div>
      <PageHeader
        eyebrow="Tax Centre"
        title="What would you owe if you sold today?"
        question="Capital-gains tax on every holding, gain harvesting, loss harvesting and the days until each holding turns long-term."
      />
      <Card className="max-w-xl p-6 text-sm text-muted-foreground">
        Add holdings with verified prices on the <Link href="/portfolio" className="font-medium text-primary hover:underline">Portfolio page</Link> to see
        your tax picture.
      </Card>
    </div>
  );
}
