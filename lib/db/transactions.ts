import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from './index';
import { accounts, holdings, instruments, transactions } from './schema';
import { buildLots, type LedgerTx, type LedgerType } from '@/lib/math/lots';

export interface LedgerEntry extends LedgerTx {
  accountId: string;
  instrumentId: string;
  symbol: string;
  name: string;
  assetClass: string;
  sector: string | null;
}

export const ledgerKey = (accountId: string, instrumentId: string) => `${accountId}:${instrumentId}`;

const istDate = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
const noonIst = (date: string) => new Date(`${date}T12:00:00+05:30`);
const LEDGER_TYPES = new Set<LedgerType>(['BUY', 'SELL', 'BONUS', 'SPLIT']);

/** Every completed ledger transaction for the user, grouped by account and instrument. */
export async function getUserLedger(userId: string): Promise<Map<string, LedgerEntry[]>> {
  const rows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      instrumentId: transactions.instrumentId,
      type: transactions.transactionType,
      date: transactions.transactionDate,
      quantity: transactions.quantity,
      price: transactions.unitPrice,
      brokerage: transactions.brokerageFee,
      symbol: instruments.symbol,
      name: instruments.name,
      assetClass: instruments.assetClass,
      sector: instruments.sector,
    })
    .from(transactions)
    .innerJoin(instruments, eq(transactions.instrumentId, instruments.id))
    .where(and(eq(transactions.userId, userId), eq(transactions.status, 'COMPLETED')))
    .orderBy(asc(transactions.transactionDate));
  const map = new Map<string, LedgerEntry[]>();
  for (const r of rows) {
    if (!LEDGER_TYPES.has(r.type as LedgerType)) continue;
    const key = ledgerKey(r.accountId, r.instrumentId);
    const list = map.get(key) ?? [];
    list.push({
      id: r.id,
      accountId: r.accountId,
      instrumentId: r.instrumentId,
      type: r.type as LedgerType,
      date: istDate(r.date),
      quantity: Number(r.quantity ?? 0),
      price: Number(r.price ?? 0),
      charges: Number(r.brokerage ?? 0),
      symbol: r.symbol,
      name: r.name,
      assetClass: r.assetClass,
      sector: r.sector,
    });
    map.set(key, list);
  }
  return map;
}

async function ledgerFor(userId: string, accountId: string, instrumentId: string): Promise<LedgerTx[]> {
  return (await getUserLedger(userId)).get(ledgerKey(accountId, instrumentId)) ?? [];
}

/**
 * Re-derives a holding's units, average cost and first purchase date from its ledger (FIFO). A
 * fully sold position is removed; a holding with no ledger is left as entered.
 */
export async function recomputeHolding(userId: string, accountId: string, instrumentId: string): Promise<void> {
  const txs = await ledgerFor(userId, accountId, instrumentId);
  if (txs.length === 0) return;
  const state = buildLots(txs);
  const where = and(eq(holdings.userId, userId), eq(holdings.accountId, accountId), eq(holdings.instrumentId, instrumentId));
  if (state.units <= 1e-6) {
    await db.delete(holdings).where(where);
    return;
  }
  const values = {
    units: state.units.toFixed(4),
    averageAcquisitionCost: state.averageCost.toFixed(2),
    firstPurchasedAt: state.firstDate ? noonIst(state.firstDate) : null,
    updatedAt: new Date(),
  };
  const updated = await db.update(holdings).set(values).where(where).returning({ id: holdings.id });
  if (updated.length === 0) await db.insert(holdings).values({ userId, accountId, instrumentId, ...values });
}

export interface NewLedgerTx {
  accountId: string;
  instrumentId: string;
  type: LedgerType;
  date: string;
  quantity: number;
  price: number;
  charges: number;
}

/** Records a transaction after checking the account belongs to the user and the sale is covered. */
export async function addLedgerTx(userId: string, tx: NewLedgerTx): Promise<{ error?: string }> {
  const [account] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, tx.accountId), eq(accounts.userId, userId))).limit(1);
  if (!account) return { error: 'Account not found.' };
  const [instrument] = await db.select({ id: instruments.id }).from(instruments).where(eq(instruments.id, tx.instrumentId)).limit(1);
  if (!instrument) return { error: 'Instrument not found.' };

  // Reject a sale (or anything before an earlier sale) that would leave the position negative.
  const existing = await ledgerFor(userId, tx.accountId, tx.instrumentId);
  const trial = buildLots([...existing, { id: 'new', ...tx }]);
  if (trial.errors.length) return { error: trial.errors[trial.errors.length - 1] };

  const gross = tx.type === 'BUY' || tx.type === 'SELL' ? tx.quantity * tx.price : 0;
  const net = tx.type === 'BUY' ? gross + tx.charges : tx.type === 'SELL' ? gross - tx.charges : 0;
  await db.insert(transactions).values({
    userId,
    accountId: tx.accountId,
    instrumentId: tx.instrumentId,
    transactionType: tx.type,
    transactionDate: noonIst(tx.date),
    quantity: tx.quantity.toFixed(4),
    unitPrice: tx.type === 'BUY' || tx.type === 'SELL' ? tx.price.toFixed(2) : null,
    grossAmount: gross.toFixed(2),
    brokerageFee: tx.charges.toFixed(2),
    netAmount: net.toFixed(2),
    status: 'COMPLETED',
  });
  await recomputeHolding(userId, tx.accountId, tx.instrumentId);
  return {};
}

export async function deleteLedgerTx(userId: string, txId: string): Promise<{ error?: string }> {
  const [row] = await db
    .select({ accountId: transactions.accountId, instrumentId: transactions.instrumentId })
    .from(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.userId, userId)))
    .limit(1);
  if (!row) return { error: 'Transaction not found.' };
  const remaining = (await ledgerFor(userId, row.accountId, row.instrumentId)).filter((t) => t.id !== txId);
  const trial = buildLots(remaining);
  if (trial.errors.length) return { error: `Deleting this would leave an impossible ledger: ${trial.errors[0]}` };
  await db.delete(transactions).where(and(eq(transactions.id, txId), eq(transactions.userId, userId)));
  if (remaining.length) await recomputeHolding(userId, row.accountId, row.instrumentId);
  return {};
}

/** Starts a ledger from an existing holding: one opening purchase at its first date and average cost. */
export async function seedLedgerFromHolding(userId: string, holdingId: string): Promise<{ error?: string }> {
  const [h] = await db.select().from(holdings).where(and(eq(holdings.id, holdingId), eq(holdings.userId, userId))).limit(1);
  if (!h) return { error: 'Holding not found.' };
  if ((await ledgerFor(userId, h.accountId, h.instrumentId)).length) return { error: 'This holding already has a ledger.' };
  if (!h.firstPurchasedAt) return { error: 'Add a purchase date for this holding first (Tax Centre or Portfolio).' };
  if (h.averageAcquisitionCost == null) return { error: 'This holding has no average cost.' };
  return addLedgerTx(userId, {
    accountId: h.accountId,
    instrumentId: h.instrumentId,
    type: 'BUY',
    date: istDate(h.firstPurchasedAt),
    quantity: Number(h.units),
    price: Number(h.averageAcquisitionCost),
    charges: 0,
  });
}
