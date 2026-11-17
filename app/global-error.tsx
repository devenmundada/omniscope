'use client';

/** Last-resort error screen, used only if the root layout itself fails. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, background: '#fbfbf8', color: '#1a1c1f' }}>
        <div style={{ maxWidth: 420, textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>OmniScope couldn&rsquo;t load.</h1>
          <p style={{ color: '#5c6066', lineHeight: 1.5 }}>Your data is safe. Please try again in a moment.</p>
          <button type="button" onClick={reset} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: 0, background: '#1f3a30', color: 'white', cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
