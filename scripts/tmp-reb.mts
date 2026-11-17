import { config } from 'dotenv';
config({ path: '.env.local' });
const { db } = await import('../lib/db/index');
const { users } = await import('../lib/db/schema');
const { getRebalanceData, summarisePlan } = await import('../lib/db/rebalance');
const us = await db.select({ id: users.id }).from(users);
for (const u of us) {
  const t0 = Date.now();
  const data = await getRebalanceData(u.id);
  if (!data) { console.log('no data'); continue; }
  console.log('load ms', Date.now() - t0, 'assets', data.assets.map(a => `${a.symbol}:${a.lots.length}:${a.category}:${Math.round(a.value)}`).join(' '));
  console.log('booked', data.booked, 'slab', data.slabRate);
  for (const target of ['maxSharpe', 'minVariance', 'sameRisk'] as const) {
    for (const cash of [0, 50000]) {
      const t1 = Date.now();
      const s = summarisePlan(data, target, cash);
      console.log(target, cash, 'ms', Date.now() - t1, 'moves', s.result.moves.length, 'te0', (s.result.te0*100).toFixed(2),
        'rec', s.result.recommendedStep, 'te', (s.plan.te*100).toFixed(2), 'tax', Math.round(s.plan.extraTax), 'turn', Math.round(s.plan.turnover),
        '| fullSmart tax', Math.round(s.full.extraTax), 'te', (s.full.te*100).toFixed(2),
        '| naiveFull tax', Math.round(s.naiveFull.tax), 'naiveSame', Math.round(s.naiveSame.tax), 'waits', s.plan.waits.length);
    }
  }
}
process.exit(0);
