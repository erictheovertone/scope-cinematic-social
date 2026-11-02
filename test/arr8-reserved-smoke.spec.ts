import { test, expect } from '@playwright/test';
import { RESERVED_ROUTES } from '../src/lib/arrival/flag';

// ── Brief ARR-8 §1 — PRODUCTION reserved-route smoke ────────────────────────────────────────────
// The ARR-7 regression: an empty PUBLIC_PROFILES_ALLOWLIST made the proxy rewrite every top-level
// route (/library, /welcome, /onboarding, …) into the Arrival public-profile page. ARR-7 fixed it
// with RESERVED_ROUTES; this is the PRODUCTION safety net that fails loudly if it ever recurs.
//
// Logged-out, read-only GETs against the deploy under test. Arrival is detected by its stable
// data-arrival-* markers, which are present in the SSR'd HTML (Arrival is a client component, so
// Next renders its initial markup on the server). A correctly-handled reserved route serves its own
// page (or redirects to /welcome) — never the Arrival markers.
//
// Run against production (or any deploy):
//   BASE_URL=https://scopeapp.world npx playwright test test/arr8-reserved-smoke.spec.ts --project=desktop-chromium
const BASE = (process.env.BASE_URL || 'https://scopeapp.world').replace(/\/$/, '');

// 'arrival' is the ONE reserved route that legitimately IS the Arrival page; the proxy never rewrites
// it (matcher excludes it). api/_next/_vercel are framework paths, not user-facing page routes.
const SKIP = new Set(['arrival', 'api', '_next', '_vercel']);
const routes = [...RESERVED_ROUTES].filter((r) => !SKIP.has(r)).sort();

// Logged OUT — no stored session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('ARR-8 §1 — reserved routes never render Arrival (production smoke)', () => {
  for (const r of routes) {
    test(`/${r} is not rewritten to Arrival`, async ({ request }) => {
      const resp = await request.get(`${BASE}/${r}`, { maxRedirects: 10, failOnStatusCode: false });
      const body = await resp.text();
      // The Arrival renderer always emits these hooks (logo mark / card / badges). Their absence is
      // the assertion: this reserved route is NOT the Arrival page.
      expect(body, `/${r} served the Arrival page — it was wrongly rewritten (status ${resp.status()})`).not.toContain('data-arrival-');
    });
  }
});
