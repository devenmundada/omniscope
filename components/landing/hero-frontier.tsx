'use client';

import { motion } from 'framer-motion';

interface Pt {
  x: number; // volatility
  y: number; // expected return
}

/** Animated efficient frontier drawn from points computed on the server by the real optimiser. */
export function HeroFrontier({ cloud, frontier, current, best }: { cloud: Pt[]; frontier: Pt[]; current: Pt; best: Pt }) {
  const W = 520;
  const H = 340;
  const pad = { l: 44, r: 16, t: 20, b: 36 };
  const xs = [...cloud, ...frontier].map((p) => p.x);
  const ys = [...cloud, ...frontier].map((p) => p.y);
  const [x0, x1] = [Math.min(...xs) * 0.95, Math.max(...xs) * 1.02];
  const [y0, y1] = [Math.min(...ys) * 0.95, Math.max(...ys) * 1.04];
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (y: number) => H - pad.b - ((y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const d = frontier.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Efficient frontier: the best expected return for each level of risk, with a sample portfolio below it">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={sy(y0 + t * (y1 - y0))} y2={sy(y0 + t * (y1 - y0))} stroke="var(--border)" strokeDasharray="3 4" />
          <text x={pad.l - 8} y={sy(y0 + t * (y1 - y0)) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
            {((y0 + t * (y1 - y0)) * 100).toFixed(0)}%
          </text>
        </g>
      ))}
      <text x={(W + pad.l) / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">Risk (volatility) →</text>
      {cloud.map((p, i) => (
        <motion.circle
          key={i}
          cx={sx(p.x)}
          cy={sy(p.y)}
          r={2.6}
          fill="var(--chart-5)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.35 }}
          transition={{ delay: 0.2 + (i % 40) * 0.012, duration: 0.4 }}
        />
      ))}
      <motion.path d={d} fill="none" stroke="var(--chart-2)" strokeWidth={3} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.6, duration: 1.4, ease: 'easeInOut' }} />
      <motion.g initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.2, duration: 0.4 }} style={{ transformOrigin: `${sx(current.x)}px ${sy(current.y)}px` }}>
        <rect x={sx(current.x) - 6} y={sy(current.y) - 6} width={12} height={12} transform={`rotate(45 ${sx(current.x)} ${sy(current.y)})`} fill="var(--danger)" />
        <text x={sx(current.x) + 12} y={sy(current.y) + 4} fontSize="12" fill="var(--foreground)">A typical portfolio</text>
      </motion.g>
      <motion.g initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2, duration: 0.4 }} style={{ transformOrigin: `${sx(best.x)}px ${sy(best.y)}px` }}>
        <circle cx={sx(best.x)} cy={sy(best.y)} r={7} fill="var(--chart-1)" stroke="var(--background)" strokeWidth={2} />
        <text x={sx(best.x) - 10} y={sy(best.y) - 14} fontSize="12" textAnchor="end" fill="var(--foreground)">Same risk, more return</text>
      </motion.g>
    </svg>
  );
}
