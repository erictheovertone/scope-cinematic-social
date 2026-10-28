import { expect, type Page } from '@playwright/test';
import { join } from 'path';
import { mkdirSync } from 'fs';

// Brief V3 §8 — shared harness for create-v3.spec.ts + create-v3-perf.spec.ts (see the former's header).
export const PUB = join(process.cwd(), 'public/test-fixtures');
export const OUT = join(process.cwd(), 'test/shots-v1');
mkdirSync(OUT, { recursive: true });
export const ASSERT = process.env.V3_ASSERT !== '0';

export const COUNTER = () => {
  type E = { ref: WeakRef<object>; t: number };
  const w = window as unknown as { __v3: { vids: E[]; gls: E[] }; __v3Counts: (since?: number) => unknown };
  w.__v3 = { vids: [], gls: [] };
  const ce = Document.prototype.createElement;
  Document.prototype.createElement = function (this: Document, tag: string, opts?: ElementCreationOptions) {
    const el = ce.call(this, tag, opts);
    if (String(tag).toLowerCase() === 'video') w.__v3.vids.push({ ref: new WeakRef(el), t: performance.now() });
    return el;
  } as typeof Document.prototype.createElement;
  const gc = HTMLCanvasElement.prototype.getContext;
  const seen = new WeakSet<object>();
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attrs?: unknown) {
    const ctx = (gc as (t: string, a?: unknown) => RenderingContext | null).call(this, type, attrs);
    if (ctx && /webgl/i.test(type) && !seen.has(ctx)) { seen.add(ctx); w.__v3.gls.push({ ref: new WeakRef(ctx), t: performance.now() }); }
    return ctx;
  } as typeof HTMLCanvasElement.prototype.getContext;
  w.__v3Counts = (since = Infinity) => {
    let vid = 0, gl = 0, vidCarry = 0, glCarry = 0;
    for (const e of w.__v3.vids) {
      const v = e.ref.deref() as HTMLVideoElement | undefined;
      if (v && (v.networkState === 2 || v.readyState >= 1)) { vid++; if (e.t < since) vidCarry++; }
    }
    for (const e of w.__v3.gls) {
      const g = e.ref.deref() as WebGLRenderingContext | undefined;
      if (g && !g.isContextLost()) { gl++; if (e.t < since) glCarry++; }
    }
    return { vid, gl, vidCarry, glCarry };
  };
};

export type Counts = { vid: number; gl: number; vidCarry: number; glCarry: number };
export const now = (page: Page) => page.evaluate(() => performance.now());
export const counts = (page: Page, since?: number) =>
  page.evaluate((s) => (window as unknown as { __v3Counts: (s?: number) => Counts }).__v3Counts(s ?? Infinity), since) as Promise<Counts>;

export async function openCreate(page: Page, path = '/create?debug=video') {
  await page.addInitScript(COUNTER);
  page.on('pageerror', (e) => { if (/Origin not allowed/i.test(e.message)) throw new Error('Privy rejected this origin — run on an allowlisted port (localhost:3000)'); });
  await page.goto(path);
  const enter = page.getByRole('button', { name: /^ENTER$/ });
  if (await enter.count()) await enter.first().click({ timeout: 3000 }).catch(() => {});
}
export async function inject(page: Page, url: string) {
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __scopeInjectMedia?: unknown }).__scopeInjectMedia === 'function'), { timeout: 15_000 }).toBeTruthy();
  await page.evaluate((u) => (window as unknown as { __scopeInjectMedia: (t: string, u: string) => Promise<void> }).__scopeInjectMedia('video', u), url);
}
export const dumpCrumbs = (page: Page) => page.evaluate(() => {
  const f = (window as unknown as { __scopeVdbgDump?: () => { crumbs: { step: string; elapsed: number; v: number; g?: number; detail?: string }[] } }).__scopeVdbgDump;
  return (f?.().crumbs ?? []).map((c) => `${c.step}+${c.elapsed.toFixed(2)}·v${c.v}${c.g != null ? `·gl${c.g}` : ''}${c.detail ? `(${c.detail})` : ''}`);
});

// Drive a fresh pick to EDIT & POST (seam), returning once the viewer has drawn (edit:ready).
export async function toEdit(page: Page, file: string) {
  await openCreate(page);
  await inject(page, `/test-fixtures/${file}`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Next' }).first().click();
  const confirm = page.getByRole('button', { name: /^Confirm$/i }).first();
  await expect(confirm).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(600);
  await confirm.evaluate((el) => (el as HTMLElement).click());
  const done = page.getByRole('button', { name: /^done$/i }).first();
  await done.waitFor({ state: 'visible', timeout: 30_000 });
  await done.evaluate((el) => (el as HTMLElement).click());
  await page.getByText(/edit & post/i).first().waitFor({ state: 'visible', timeout: 25_000 });
  await expect.poll(async () => (await dumpCrumbs(page)).some((c) => c.startsWith('edit:ready')), { timeout: 20_000 }).toBeTruthy();
}

// ── §3/§8 — scrub the strip: same element, no second decode/GL, no long task > 50ms ────────────────
