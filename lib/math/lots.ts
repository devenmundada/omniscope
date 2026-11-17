/**
 * FIFO lot accounting for a single holding (one instrument in one account). Pure functions.
 *
 * Indian rules followed: sales use up the earliest units first (FIFO, as required for demat
 * holdings); bonus shares have a cost of zero and their own allotment date; a split multiplies units
 * and divides cost while keeping each lot's original date. Charges are added to the cost of a
 * purchase and deducted from the proceeds of a sale.
 */

export type LedgerType = 'BUY' | 'SELL' | 'BONUS' | 'SPLIT';

export interface LedgerTx {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  type: LedgerType;
  /** Units bought, sold or received as bonus; for SPLIT, the multiplier (2 for a 1:2 split). */
  quantity: number;
  /** Price per unit (ignored for BONUS and SPLIT). */
  price: number;
  /** Brokerage, STT, stamp duty, GST and other charges. */
  charges: number;
}

export interface Lot {
  buyDate: string;
  units: number;
  /** Cost per unit including purchase charges. */
  costPerUnit: number;
  sourceId: string;
}

export interface RealizedLot {
  sellDate: string;
  buyDate: string;
  units: number;
  proceeds: number;
  cost: number;
  gain: number;
  sellId: string;
}

export interface LedgerState {
  open: Lot[];
  realized: RealizedLot[];
  units: number;
  /** Remaining cost of open lots. */
  invested: number;
  averageCost: number;
  firstDate: string | null;
  /** Problems such as selling more units than held. */
  errors: string[];
}

const ORDER: Record<LedgerType, number> = { SPLIT: 0, BONUS: 1, BUY: 2, SELL: 3 };
const EPS = 1e-9;

export function buildLots(transactions: LedgerTx[]): LedgerState {
  const txs = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.type] - ORDER[b.type]);
  let open: Lot[] = [];
  const realized: RealizedLot[] = [];
  const errors: string[] = [];

  for (const t of txs) {
    if (!(t.quantity > 0)) {
      errors.push(`${t.date}: quantity must be positive`);
      continue;
    }
    if (t.type === 'BUY') {
      open.push({ buyDate: t.date, units: t.quantity, costPerUnit: (t.quantity * t.price + (t.charges || 0)) / t.quantity, sourceId: t.id });
    } else if (t.type === 'BONUS') {
      open.push({ buyDate: t.date, units: t.quantity, costPerUnit: 0, sourceId: t.id });
    } else if (t.type === 'SPLIT') {
      open = open.map((l) => ({ ...l, units: l.units * t.quantity, costPerUnit: l.costPerUnit / t.quantity }));
    } else {
      const held = open.reduce((s, l) => s + l.units, 0);
      if (t.quantity > held + EPS) {
        errors.push(`${t.date}: sold ${t.quantity} units but only ${Math.round(held * 10000) / 10000} were held`);
        continue;
      }
      const proceedsPerUnit = (t.quantity * t.price - (t.charges || 0)) / t.quantity;
      let left = t.quantity;
      while (left > EPS && open.length) {
        const lot = open[0];
        const used = Math.min(lot.units, left);
        realized.push({
          sellDate: t.date,
          buyDate: lot.buyDate,
          units: used,
          proceeds: used * proceedsPerUnit,
          cost: used * lot.costPerUnit,
          gain: used * (proceedsPerUnit - lot.costPerUnit),
          sellId: t.id,
        });
        lot.units -= used;
        left -= used;
        if (lot.units <= EPS) open.shift();
      }
    }
  }

  const units = open.reduce((s, l) => s + l.units, 0);
  const invested = open.reduce((s, l) => s + l.units * l.costPerUnit, 0);
  return {
    open,
    realized,
    units,
    invested,
    averageCost: units > EPS ? invested / units : 0,
    firstDate: open.length ? open.reduce((d, l) => (l.buyDate < d ? l.buyDate : d), open[0].buyDate) : null,
    errors,
  };
}
