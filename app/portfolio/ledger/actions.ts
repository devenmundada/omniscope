'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { addLedgerTx, deleteLedgerTx, seedLedgerFromHolding } from '@/lib/db/transactions';
import { todayInIndia } from '@/lib/db/tax';

const txSchema = z.object({
  accountId: z.string().uuid(),
  instrumentId: z.string().uuid(),
  type: z.enum(['BUY', 'SELL', 'BONUS', 'SPLIT']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().positive().max(1e9),
  price: z.number().min(0).max(1e8),
  charges: z.number().min(0).max(1e8),
});

async function userId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function refresh() {
  for (const p of ['/portfolio/ledger', '/portfolio', '/tax', '/', '/risk', '/journey', '/goals']) revalidatePath(p);
}

export async function addTransactionAction(input: z.infer<typeof txSchema>): Promise<{ success?: boolean; error?: string }> {
  const parsed = txSchema.safeParse(input);
  if (!parsed.success) return { error: 'Please check the date, quantity and price.' };
  if (parsed.data.date > todayInIndia()) return { error: 'The date cannot be in the future.' };
  if ((parsed.data.type === 'BUY' || parsed.data.type === 'SELL') && parsed.data.price <= 0) return { error: 'Enter the price per unit.' };
  const id = await userId();
  if (!id) return { error: 'Please sign in again.' };
  const res = await addLedgerTx(id, parsed.data).catch((e: unknown) => ({ error: e instanceof Error ? e.message : 'Could not save.' }));
  if (res.error) return res;
  refresh();
  return { success: true };
}

export async function deleteTransactionAction(txId: string): Promise<{ success?: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(txId).success) return { error: 'Unknown transaction.' };
  const id = await userId();
  if (!id) return { error: 'Please sign in again.' };
  const res = await deleteLedgerTx(id, txId);
  if (res.error) return res;
  refresh();
  return { success: true };
}

export async function seedLedgerAction(holdingId: string): Promise<{ success?: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(holdingId).success) return { error: 'Unknown holding.' };
  const id = await userId();
  if (!id) return { error: 'Please sign in again.' };
  const res = await seedLedgerFromHolding(id, holdingId);
  if (res.error) return res;
  refresh();
  return { success: true };
}
