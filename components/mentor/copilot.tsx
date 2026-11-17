'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { ArrowUp, Check, Loader2, MessageSquarePlus, Sparkles, Square, Trash2, Wrench, Dices } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatINRCompact } from '@/lib/format';
import { deleteConversationAction } from '@/app/mentor/actions';
import { MicButton, SpeakButton, setCopilotLanguage, useCopilotLanguage, useVoiceInput } from './voice';

const TOOL_LABELS: Record<string, string> = {
  getPortfolioOverview: 'Read your portfolio totals',
  getHoldings: 'Read your holdings',
  getPortfolioXRay: 'Ran your Portfolio X-Ray',
  getFinancialHealth: 'Checked your Financial Health',
  getGoals: 'Read your goals',
  simulateGoalChange: 'Simulated a what-if scenario',
  calculateSip: 'Ran a SIP calculation',
  getRiskReport: 'Ran your Risk Lab analysis',
  optimizePortfolio: 'Ran the portfolio optimiser',
  stressTestPortfolio: 'Crash-tested your portfolio',
  getTaxEstimate: 'Estimated your capital-gains tax',
  optimizeForGoals: 'Ran the goal-based optimiser',
  planTaxSmartRebalance: 'Planned a tax-smart rebalance',
  getAlerts: 'Checked what needs your attention',
};

const STARTERS_HI = [
  'मेरा Financial Health score समझाइए और सबसे पहले क्या सुधारना चाहिए?',
  'मेरा पोर्टफोलियो कितना जोखिम भरा है, और जोखिम कहाँ से आ रहा है?',
  'अगर मार्च 2020 जैसी गिरावट आए तो मेरे पोर्टफोलियो का क्या होगा?',
  'अगर मैं आज सब बेच दूँ तो मुझे कितना टैक्स देना होगा?',
];

const STARTERS = [
  'Explain my Financial Health score and the one thing to fix first.',
  'How risky is my portfolio, and where does the risk come from?',
  'What would a crash like March 2020 do to my portfolio?',
  'What if I increase the SIP on my first goal by ₹5,000 a month?',
];

interface ConversationItem {
  id: string;
  title: string;
  updatedAt: string;
}

interface WhatIfOutput {
  goal?: string;
  error?: string;
  scenario?: { monthlySipINR: number; targetINR: number; deadline: string };
  monteCarloProbabilityPct?: number | null;
  previousMonteCarloProbabilityPct?: number | null;
  medianOutcomeINR?: number | null;
  requiredSipAt10PctINR?: number;
}

const MAX_TRACE_CHARS = 6000;

function traceJson(value: unknown): string {
  const text = JSON.stringify(value, null, 2) ?? '';
  return text.length > MAX_TRACE_CHARS ? `${text.slice(0, MAX_TRACE_CHARS)}\n… (${(text.length - MAX_TRACE_CHARS).toLocaleString('en-IN')} more characters)` : text;
}

/** A tool step, expandable to show exactly what the Copilot asked for and what the engine returned. */
function ToolChip({ name, done, input, output }: { name: string; done: boolean; input?: unknown; output?: unknown }) {
  const [open, setOpen] = useState(false);
  const hasInput = input != null && typeof input === 'object' && Object.keys(input as object).length > 0;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!done}
        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:hover:border-border/60"
      >
        {done ? <Check className="size-3 text-emerald-700" /> : <Loader2 className="size-3 animate-spin" />}
        <Wrench className="size-3" />
        {TOOL_LABELS[name] ?? name}
        {done && <span className="ml-1 text-primary">{open ? 'Hide working' : 'Show working'}</span>}
      </button>
      {open && (
        <div className="mt-2 max-w-full rounded-lg border border-border/60 bg-muted/40 p-3 text-[11px]">
          <p className="font-medium text-foreground">
            Tool <code>{name}</code>{hasInput ? ' called with' : ' (no inputs)'}
          </p>
          {hasInput && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-muted-foreground">{traceJson(input)}</pre>}
          <p className="mt-2 font-medium text-foreground">Engine result the answer was written from</p>
          {output === undefined ? (
            <p className="mt-1 text-muted-foreground">Results are kept only for answers given in this session.</p>
          ) : (
            <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap font-mono text-muted-foreground">{traceJson(output)}</pre>
          )}
          <p className="mt-2 text-muted-foreground">Every figure in the answer should appear here; the model is instructed never to invent numbers.</p>
        </div>
      )}
    </div>
  );
}

interface RebalanceOutput {
  error?: string;
  target?: string;
  gapToTargetTodayPct?: number;
  recommendedPlan?: { gapClosedPct: number; totalCostINR: number };
  oldestFirstForSameGap?: { taxINR: number; totalCostINR: number } | string;
}

function RebalanceCard({ out }: { out: RebalanceOutput }) {
  if (out.error || !out.recommendedPlan) return null;
  const plan = out.recommendedPlan;
  const naive = typeof out.oldestFirstForSameGap === 'object' ? out.oldestFirstForSameGap : null;
  return (
    <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Tax-smart rebalance · {out.target}</p>
      <div className="mt-2 flex flex-wrap items-end gap-5">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Gap closed</p>
          <p className="font-serif text-3xl tnum text-foreground">{plan.gapClosedPct}%</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Tax + charges</p>
          <p className="font-serif text-2xl tnum text-foreground">{formatINRCompact(plan.totalCostINR)}</p>
        </div>
        {naive && (
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Oldest-first, same result</p>
            <p className="font-serif text-2xl tnum text-muted-foreground">{formatINRCompact(naive.totalCostINR)}</p>
          </div>
        )}
        <Link href="/rebalance" className="ml-auto text-xs font-medium text-primary hover:underline">Open the plan →</Link>
      </div>
    </div>
  );
}

function WhatIfCard({ out }: { out: WhatIfOutput }) {
  if (out.error || out.monteCarloProbabilityPct == null) return null;
  const before = out.previousMonteCarloProbabilityPct;
  const after = out.monteCarloProbabilityPct;
  return (
    <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
        <Dices className="size-3.5" /> What-if · {out.goal}
      </p>
      <div className="mt-2 flex items-end gap-4">
        {before != null && (
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Now</p>
            <p className="font-serif text-2xl tnum text-muted-foreground">{before}%</p>
          </div>
        )}
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">With change</p>
          <p className="font-serif text-3xl tnum text-foreground">{after}%</p>
        </div>
        <div className="ml-auto text-right text-xs text-muted-foreground">
          {out.scenario && <p>SIP {formatINRCompact(out.scenario.monthlySipINR)}/mo · target {formatINRCompact(out.scenario.targetINR)}</p>}
          {out.medianOutcomeINR != null && <p>Median outcome {formatINRCompact(out.medianOutcomeINR)}</p>}
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Monte Carlo, 10,000 simulated market paths.</p>
    </div>
  );
}

function MessageBody({ message, canSpeak }: { message: UIMessage; canSpeak?: boolean }) {
  const spoken = message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
  return (
    <div className="space-y-2">
      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          return message.role === 'user' ? (
            <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">{part.text}</p>
          ) : (
            <div key={i} className="prose prose-sm max-w-none text-pretty leading-relaxed dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-li:my-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
            </div>
          );
        }
        if (part.type.startsWith('tool-')) {
          const name = part.type.slice(5);
          const p = part as unknown as { state: string; input?: unknown; output?: unknown };
          const done = p.state === 'output-available';
          return (
            <div key={i}>
              <ToolChip name={name} done={done} input={p.input} output={p.output} />
              {done && name === 'simulateGoalChange' && <WhatIfCard out={p.output as WhatIfOutput} />}
              {done && name === 'planTaxSmartRebalance' && <RebalanceCard out={p.output as RebalanceOutput} />}
            </div>
          );
        }
        return null;
      })}
      {canSpeak && message.role === 'assistant' && <SpeakButton text={spoken} />}
    </div>
  );
}

export function Copilot({
  conversationId,
  initialMessages,
  conversations,
  aiConfigured,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  conversations: ConversationItem[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), []);
  const { messages, sendMessage, status, error, stop } = useChat({ id: conversationId, messages: initialMessages, transport });
  const busy = status === 'submitted' || status === 'streaming';
  const language = useCopilotLanguage();
  const hindi = language === 'hi';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, status]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    await sendMessage({ text: t }, { body: { language } });
    // Pin the conversation id in the URL. Without ?c=, the server would mint a new id on refresh,
    // remount this component with an empty chat and wipe the answer that just streamed in.
    if (new URLSearchParams(window.location.search).get('c') === conversationId) {
      router.refresh();
    } else {
      router.replace(`/mentor?c=${conversationId}`, { scroll: false });
    }
  };

  const voice = useVoiceInput(language, setInput, (text) => void send(text));

  const newChat = () => router.push(`/mentor?c=${crypto.randomUUID()}`);

  let errorText: string | null = null;
  if (error) {
    try {
      errorText = JSON.parse(error.message)?.error ?? error.message;
    } catch {
      errorText = error.message;
    }
  }

  return (
    <div className="grid h-full gap-4 lg:grid-cols-[240px_1fr]">
      <aside className="hidden flex-col gap-2 overflow-hidden lg:flex">
        <Button onClick={newChat} variant="outline" size="sm" className="justify-start gap-2">
          <MessageSquarePlus className="size-4" /> New conversation
        </Button>
        <div className="mt-1 flex-1 space-y-1 overflow-y-auto pr-1">
          {conversations.length === 0 && <p className="px-2 text-xs text-muted-foreground">Your saved conversations appear here.</p>}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                'group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs',
                c.id === conversationId ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60'
              )}
            >
              <Link href={`/mentor?c=${c.id}`} className="line-clamp-2 flex-1">
                {c.title}
              </Link>
              <form action={deleteConversationAction}>
                <input type="hidden" name="id" value={c.id} />
                <button type="submit" aria-label={`Delete conversation ${c.title}`} className="opacity-0 transition-opacity group-hover:opacity-100">
                  <Trash2 className="size-3.5" />
                </button>
              </form>
            </div>
          ))}
        </div>
      </aside>

      <Card className="flex h-full min-h-0 flex-col overflow-hidden border-border/60 bg-card/50 shadow-sm">
        <div className="flex-1 overflow-y-auto p-6">
          {!aiConfigured && (
            <div className="mx-auto mb-6 max-w-2xl rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
              The AI Copilot needs a free Google Gemini API key. Add <code>GOOGLE_GENERATIVE_AI_API_KEY</code> in the deployment settings and redeploy.
            </div>
          )}
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center space-y-6 pt-8">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="size-6" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-medium text-foreground">{hindi ? 'अपने पैसों के बारे में कुछ भी पूछें।' : 'Ask anything about your money.'}</h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {hindi
                    ? 'मैं आपकी होल्डिंग्स, जोखिम, टैक्स और लक्ष्यों का असली डेटा पढ़ता हूँ, गणना करता हूँ और आसान भाषा में समझाता हूँ। बोलकर भी पूछ सकते हैं।'
                    : 'I read your verified holdings, risk, tax, health score and goals, run the calculations, and explain the result. You can also ask by voice, in English or Hindi.'}
                </p>
              </div>
              <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                {(hindi ? STARTERS_HI : STARTERS).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    disabled={busy || !aiConfigured}
                    className="rounded-lg border border-border/50 bg-background/50 px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col space-y-6 pb-4">
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn('flex w-full', m.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {m.role !== 'user' && (
                    <div className="mr-3 mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Sparkles className="size-4" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[85%]',
                      m.role === 'user' ? 'rounded-2xl rounded-tr-sm bg-primary px-5 py-3 text-primary-foreground' : 'pt-1 text-foreground'
                    )}
                  >
                    <MessageBody message={m} canSpeak={!busy || m.id !== messages[messages.length - 1]?.id} />
                  </div>
                </motion.div>
              ))}
              {status === 'submitted' && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Reading your financial data…
                </div>
              )}
              {errorText && (
                <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-200">
                  {errorText}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-border/60 bg-background/50 p-4 backdrop-blur-sm">
          <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between gap-3">
            <div role="radiogroup" aria-label="Copilot language" className="inline-flex rounded-full border border-border/60 bg-background p-0.5 text-xs">
              {(['en', 'hi'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={language === l}
                  onClick={() => setCopilotLanguage(l)}
                  className={cn('rounded-full px-3 py-1 transition-colors', language === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {l === 'en' ? 'English' : 'हिन्दी'}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground" aria-live="polite">
              {voice.listening ? (hindi ? 'सुन रहा हूँ… बोलना बंद करने पर सवाल भेज दिया जाएगा' : 'Listening… your question is sent when you stop speaking') : voice.error ?? ''}
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="relative mx-auto flex max-w-3xl items-center"
          >
            <label htmlFor="copilot-input" className="sr-only">Ask the AI Copilot</label>
            <input
              id="copilot-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={2000}
              placeholder={
                !aiConfigured ? 'AI key not configured' : hindi ? 'अपने पोर्टफोलियो, जोखिम, टैक्स या लक्ष्यों के बारे में पूछें…' : 'Ask about your portfolio, risks, tax or goals…'
              }
              disabled={!aiConfigured}
              lang={hindi ? 'hi' : 'en'}
              className={cn(
                'h-12 w-full rounded-full border border-border/60 bg-background pl-6 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-primary/50',
                voice.supported ? 'pr-24' : 'pr-14'
              )}
            />
            {voice.supported && !busy && (
              <div className="absolute right-12">
                <MicButton listening={voice.listening} onStart={voice.start} onStop={voice.stop} disabled={!aiConfigured} lang={language} />
              </div>
            )}
            {busy ? (
              <Button type="button" size="icon" onClick={() => stop()} className="absolute right-1.5 size-9 rounded-full" aria-label="Stop generating">
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim() || !aiConfigured} className="absolute right-1.5 size-9 rounded-full" aria-label="Send message">
                <ArrowUp className="size-4" />
              </Button>
            )}
          </form>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            OmniScope Copilot is an educational mentor powered by Google Gemini, not a SEBI-registered adviser. It cannot execute trades.
          </p>
        </div>
      </Card>
    </div>
  );
}
