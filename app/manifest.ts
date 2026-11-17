import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OmniScope — AI wealth operating system',
    short_name: 'OmniScope',
    description: 'Understand your money: verified portfolio, risk, tax and goals for Indian investors, with an AI Copilot in English and Hindi.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fbfbf8',
    theme_color: '#1f3a30',
    lang: 'en-IN',
    categories: ['finance', 'education', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'AI Copilot', url: '/mentor', description: 'Ask about your money' },
      { name: 'Alerts', url: '/alerts', description: 'What needs your attention' },
      { name: 'Tax Centre', url: '/tax', description: 'Capital-gains tax and harvesting' },
    ],
  };
}
