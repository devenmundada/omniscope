import { describe, expect, it } from 'vitest';
import { buildLots, type LedgerTx } from '@/lib/math/lots';

const tx = (o: Partial<LedgerTx> & Pick<LedgerTx, 'date' | 'type' | 'quantity'>): LedgerTx => ({ id: `${o.date}-${o.type}`, price: 0, charges: 0, ...o });

describe('FIFO lots', () => {
  it('sells the earliest units first and books the gain per lot', () => {
    const s = buildLots([
      tx({ date: '2024-01-10', type: 'BUY', quantity: 10, price: 100 }),
      tx({ date: '2024-06-10', type: 'BUY', quantity: 10, price: 150 }),
      tx({ date: '2025-03-01', type: 'SELL', quantity: 15, price: 200 }),
    ]);
    expect(s.realized).toEqual([
      expect.objectContaining({ buyDate: '2024-01-10', units: 10, cost: 1000, proceeds: 2000, gain: 1000 }),
      expect.objectContaining({ buyDate: '2024-06-10', units: 5, cost: 750, proceeds: 1000, gain: 250 }),
    ]);
    expect(s.units).toBe(5);
    expect(s.open[0]).toMatchObject({ buyDate: '2024-06-10', units: 5, costPerUnit: 150 });
    expect(s.averageCost).toBe(150);
    expect(s.firstDate).toBe('2024-06-10');
  });

  it('adds charges to cost and takes them from proceeds', () => {
    const s = buildLots([tx({ date: '2024-01-01', type: 'BUY', quantity: 10, price: 100, charges: 20 }), tx({ date: '2024-02-01', type: 'SELL', quantity: 10, price: 110, charges: 10 })]);
    expect(s.realized[0].cost).toBe(1020);
    expect(s.realized[0].proceeds).toBe(1090);
    expect(s.realized[0].gain).toBeCloseTo(70);
  });

  it('gives bonus shares zero cost and their own date, and keeps dates through a split', () => {
    const s = buildLots([
      tx({ date: '2023-01-01', type: 'BUY', quantity: 60, price: 1540 }),
      tx({ date: '2025-08-26', type: 'BONUS', quantity: 60 }),
      tx({ date: '2026-01-15', type: 'SPLIT', quantity: 2 }),
    ]);
    expect(s.open).toEqual([
      expect.objectContaining({ buyDate: '2023-01-01', units: 120, costPerUnit: 770 }),
      expect.objectContaining({ buyDate: '2025-08-26', units: 120, costPerUnit: 0 }),
    ]);
    expect(s.invested).toBe(60 * 1540);
    expect(s.averageCost).toBe(385);
  });

  it('flags a sale larger than the holding instead of going negative', () => {
    const s = buildLots([tx({ date: '2024-01-01', type: 'BUY', quantity: 5, price: 10 }), tx({ date: '2024-02-01', type: 'SELL', quantity: 8, price: 12 })]);
    expect(s.errors[0]).toMatch(/sold 8 units but only 5/);
    expect(s.units).toBe(5);
  });

  it('applies same-day buys before sells', () => {
    const s = buildLots([tx({ date: '2024-01-01', type: 'SELL', quantity: 5, price: 12 }), tx({ date: '2024-01-01', type: 'BUY', quantity: 5, price: 10 })]);
    expect(s.errors).toEqual([]);
    expect(s.realized[0].gain).toBe(10);
  });
});
