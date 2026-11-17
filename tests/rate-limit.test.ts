import { describe, expect, it, vi } from 'vitest';
import { burstLimit } from '@/lib/rate-limit';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

describe('burst limiter', () => {
  it('allows up to the limit in a window, then blocks, then resets', () => {
    const t0 = 1_000_000;
    const results = Array.from({ length: 5 }, (_, i) => burstLimit('u1', 3, 60_000, t0 + i));
    expect(results).toEqual([false, false, false, true, true]);
    expect(burstLimit('u2', 3, 60_000, t0)).toBe(false); // other keys are independent
    expect(burstLimit('u1', 3, 60_000, t0 + 60_000)).toBe(false); // new window
  });
});
