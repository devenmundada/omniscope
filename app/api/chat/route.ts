import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req: Request) {
  // Enforce authentication on chat route if Supabase is configured
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Sign in required to access mentor chat.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Authentication verification failed.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const { messages } = await req.json();
  const latestMessage = messages[messages.length - 1]?.content || '';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendChunk = (text: string) => {
        controller.enqueue(encoder.encode(text));
      };

      // 1. Simulate network delay
      await delay(600);

      // 2. Logic to pick response based on prompt
      if (
        latestMessage.includes('Health Score') ||
        latestMessage.includes('Protection') ||
        latestMessage.includes('health')
      ) {
        sendChunk(
          '0:"Your Financial Health Score dropped slightly this month because your term life coverage is below the recommended threshold. Let\'s look at your protection metrics:\\n"\n'
        );
        await delay(500);
        sendChunk('9:{"id":"call_health","toolName":"showHealthCard","args":{}}\n');
        await delay(300);
        sendChunk('a:{"toolCallId":"call_health","result":"rendered"}\n');
        await delay(300);
        sendChunk(
          '0:"\\nWe recommend bringing this closer to 10-15x your annual income to ensure your family is shielded from financial hardship."\n'
        );
      } else if (
        latestMessage.includes('Portfolio') ||
        latestMessage.includes('highlight') ||
        latestMessage.includes('X-Ray')
      ) {
        sendChunk('0:"I analyzed your portfolio across all brokers and funds. You have been investing consistently, and it shows.\\n"\n');
        await delay(500);
        sendChunk('9:{"id":"call_portfolio","toolName":"showPortfolioHighlight","args":{}}\n');
        await delay(300);
        sendChunk('a:{"toolCallId":"call_portfolio","result":"rendered"}\n');
        await delay(300);
        sendChunk(
          '0:"\\nHowever, your Portfolio X-Ray reveals concentration in your top holdings. Would you like to review diversification metrics?"\n'
        );
      } else {
        sendChunk('0:"That is a thoughtful financial question. Systematic discipline and milestone planning are key.\\n"\n');
        await delay(400);
        sendChunk(
          '0:"Based on your current profile, you are maintaining a healthy emergency buffer and regular savings cadence.\\n"\n'
        );
        await delay(400);
        sendChunk(
          '0:"When adjusting allocations, prioritize low-cost broad index diversification and keep liquidity aligned with short-term obligations."\n'
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'x-vercel-ai-data-stream': 'v1',
    },
  });
}
