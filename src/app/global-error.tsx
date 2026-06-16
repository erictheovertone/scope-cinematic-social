'use client';
// ── GLOBAL error boundary ─────────────────────────────────────────────────────
//
// Catches throws in the ROOT layout subtree — including the provider tree
// (PrivyProvider, EconomyProvider, …). Without this, a single client-side throw
// during hydration takes down the whole app and the browser falls into a reload
// loop ("A problem repeatedly occurred" on Safari). This converts that into a
// recoverable screen AND surfaces the real error (message + digest) so a
// prod-only crash is never blind again.
//
// DEPENDENCY-FREE on purpose: the thing that broke may BE a provider, so this UI
// imports nothing from the app — only React. It renders its own <html>/<body>
// because it replaces the root layout when the root layout itself throws.

import { useEffect, useState } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Make the real throw legible in any prod console (the boundary keeps the
    // client-side message; server errors arrive as a digest only).
    console.error('[global-error] app crashed:', error?.message, '| digest:', error?.digest, error);
  }, [error]);

  const detail = [error?.message, error?.digest ? `digest: ${error.digest}` : null]
    .filter(Boolean)
    .join('\n');

  const mono = "'SK-Modernist', 'IBM Plex Mono', monospace";

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#000', color: '#fff', fontFamily: mono }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 24px',
            textAlign: 'center',
            gap: 18,
          }}
        >
          <div style={{ width: 15, height: 15, borderRadius: '50%', background: '#FF0000' }} />
          <p style={{ fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', margin: 0 }}>
            Something broke
          </p>
          <p style={{ fontSize: 11, lineHeight: 1.6, color: 'rgba(255,255,255,0.55)', maxWidth: 320, margin: 0 }}>
            The app hit an error and stopped. Try again — if it keeps happening,
            send us the detail below.
          </p>

          {detail && (
            <pre
              style={{
                fontSize: 10,
                lineHeight: 1.5,
                color: '#FF0000',
                background: 'rgba(255,0,0,0.06)',
                border: '1px solid rgba(255,0,0,0.25)',
                padding: '10px 12px',
                margin: 0,
                maxWidth: '92vw',
                overflowX: 'auto',
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {detail}
            </pre>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              onClick={() => reset()}
              style={{
                background: 'transparent',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.4)',
                padding: '9px 18px',
                fontFamily: mono,
                fontSize: 11,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              onClick={() => {
                try {
                  navigator.clipboard?.writeText(detail);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch { /* clipboard unavailable — the detail is visible above */ }
              }}
              style={{
                background: 'transparent',
                color: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.2)',
                padding: '9px 18px',
                fontFamily: mono,
                fontSize: 11,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {copied ? 'Copied' : 'Copy detail'}
            </button>
          </div>

          <a
            href="/"
            style={{
              marginTop: 6,
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.4)',
              textDecoration: 'none',
            }}
          >
            Back to start
          </a>
        </div>
      </body>
    </html>
  );
}
