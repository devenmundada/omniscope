'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatINRCompact } from '@/lib/format';

export interface BenchmarkPoint {
  date: string;
  value: number;
  invested: number;
  benchmark: number | null;
}

const label = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

export function BenchmarkChart({ data }: { data: BenchmarkPoint[] }) {
  return (
    <div className="h-[280px] w-full" role="img" aria-label="Portfolio value compared with amount invested and the Nifty 50 benchmark over the last year">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={label}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            dy={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            tickFormatter={(v) => formatINRCompact(v)}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(v) => new Date(String(v)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            formatter={(v, name) => [formatINRCompact(Number(v)), String(name)]}
          />
          <Line type="monotone" dataKey="value" name="Your portfolio" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="benchmark" name="Same money in Nifty 50" stroke="var(--chart-2)" strokeWidth={1.75} dot={false} connectNulls />
          <Line type="stepAfter" dataKey="invested" name="Amount invested" stroke="var(--chart-5)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
