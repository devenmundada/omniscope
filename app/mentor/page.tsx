import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import type { UIMessage } from 'ai';
import { PageHeader } from '@/components/omni/primitives';
import { Card } from '@/components/ui/card';
import { Copilot } from '@/components/mentor/copilot';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { isAiConfigured } from '@/lib/ai/model';
import { getConversationMessages, listConversations } from '@/lib/db/conversations';

export const metadata = {
  title: 'AI Copilot — OmniScope',
};

export const dynamic = 'force-dynamic';

export default async function MentorPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const user = isSupabaseConfigured()
    ? (await (await createClient()).auth.getUser()).data.user
    : null;

  if (!user) {
    return (
      <div className="flex h-[calc(100svh-6rem)] flex-col">
        <PageHeader
          eyebrow="AI Copilot"
          title="What should we understand next?"
          question="Sign in to talk to an AI mentor that reads your own verified portfolio, health score and goals."
        />
        <div className="mb-4">
          <Link href="/auth/login?next=/mentor" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Sign in to use the AI Copilot →
          </Link>
        </div>
        <Card className="max-w-3xl space-y-4 p-6 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Example conversation</p>
          <p className="ml-auto w-fit rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-primary-foreground">
            What if I increase my house SIP by ₹5,000?
          </p>
          <div className="space-y-2 text-foreground">
            <p className="text-[11px] text-muted-foreground">✓ Read your goals · ✓ Simulated a what-if scenario</p>
            <p>
              Raising the SIP on <em>Home Down Payment</em> from ₹25,000 to ₹30,000 lifts your Monte Carlo probability of reaching ₹25 lakh by 2031
              from about 55% to about 78%. The median outcome rises to roughly ₹29 lakh.
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground">Illustrative example. Signed-in answers use your own verified data.</p>
        </Card>
      </div>
    );
  }

  const conversationId = c && /^[0-9a-f-]{36}$/i.test(c) ? c : randomUUID();
  const [conversations, loaded] = await Promise.all([
    listConversations(user.id),
    c ? getConversationMessages(user.id, conversationId) : Promise.resolve(null),
  ]);

  const initialMessages: UIMessage[] = (loaded?.messages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant', parts: [{ type: 'text', text: m.content }] }));

  return (
    <div className="flex h-[calc(100svh-6rem)] flex-col">
      <PageHeader
        eyebrow="AI Copilot"
        title="What should we understand next?"
        question="An AI mentor that reads your verified holdings, X-Ray, health score and goals — and runs what-if simulations before it answers."
      />
      <div className="min-h-0 flex-1">
        <Copilot
          key={conversationId}
          conversationId={conversationId}
          initialMessages={initialMessages}
          conversations={conversations.map((x) => ({ id: x.id, title: x.title, updatedAt: x.updatedAt.toISOString() }))}
          aiConfigured={isAiConfigured()}
        />
      </div>
    </div>
  );
}
