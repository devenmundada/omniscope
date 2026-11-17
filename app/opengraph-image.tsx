import { ImageResponse } from 'next/og';

export const alt = 'OmniScope — an AI wealth operating system for Indian investors';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const features = ['Verified NSE & AMFI prices', 'Risk Lab & optimiser', 'Tax-smart rebalancing', 'Hindi voice Copilot'];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#1f3a30', color: '#ffffff', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="40" height="40" viewBox="146 146 220 220">
              <path d="M256 146 C 266 222 290 246 366 256 C 290 266 266 290 256 366 C 246 290 222 266 146 256 C 222 246 246 222 256 146 Z" fill="#1f3a30" />
            </svg>
          </div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>OmniScope</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 72, lineHeight: 1.05, fontWeight: 700, maxWidth: 980 }}>Understand your money, with every number shown.</div>
          <div style={{ fontSize: 30, color: '#b9d8ca' }}>An AI wealth operating system for Indian investors.</div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {features.map((f) => (
            <div key={f} style={{ display: 'flex', padding: '10px 18px', borderRadius: 999, background: 'rgba(255,255,255,0.12)', fontSize: 24 }}>
              {f}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
