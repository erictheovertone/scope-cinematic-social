// Brief P4 — SMOOTHNESS GATE. Measures the app's hot paths and checks them against the P4
// budget; keep it green. Every number comes from here — no feel-based claims.
//
//   node test/smooth-gate.mjs --label before            (BASE_URL defaults to local :3000)
//   node test/smooth-gate.mjs --label after --compare before
//
// Engine: Chromium (CDP). WebKit exposes no longtask / layout-shift / heap APIs, so the
// "iPhone" profile is Chromium emulating it: 375×812 @3x, touch, mobile UA, CPU throttled
// 4× (≈ a mid iPhone on JS-heavy work). Desktop: 1440×900, no throttle. Cold load runs on
// simulated 4G (150ms RTT, 1.6 Mbps down / 750 Kbps up — Lighthouse's mobile preset), cache
// disabled. Gestures are real compositor gestures (Input.synthesizeScrollGesture), not
// scrollTop writes. Uses the stored Privy session (test/.auth/state.json — npm run create:login).
//
// Per scenario: long tasks (>50ms: count, total ms) · p95 / max frame time (rAF deltas) ·
// CLS (layout-shift, no recent input) · JS heap peak · cold load adds TTI, request count,
// transferred bytes and the five heaviest JS chunks.
import { chromium, devices } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const LABEL = opt('label', 'run');
const COMPARE = opt('compare', null);
const ONLY = opt('only', null); // e.g. --only mobile
const HEAP_MIN = +opt('heap-minutes', '3');
const TRAPS_ONLY = args.includes('--traps-only'); // M22: run just the scroll-trap sweep
const OUT_DIR = 'test/.perf';
mkdirSync(OUT_DIR, { recursive: true });

const BUDGET = {
  fling: { p95: 16.7, over50: 0 },
  tabPaintMs: 100,
  cls: 0.05,
  longTasksPerLoad: 2,
  ttiMs: 2500,
};

// ── in-page collector ────────────────────────────────────────────────────────
const COLLECTOR = () => {
  const P = (window.__perf = { frames: [], lt: [], cls: 0, last: 0, on: true });
  const loop = (t) => { if (P.last) P.frames.push(t - P.last); P.last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => P.lt.push({ s: e.startTime, d: e.duration }))).observe({ type: 'longtask', buffered: true }); } catch {}
  // CLS + the top shift sources (so a regression names its culprit)
  P.shifts = [];
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.hadRecentInput) return; P.cls += e.value; if (e.value > 0.005) P.shifts.push({ v: Math.round(e.value * 1000) / 1000, at: location.pathname, src: (e.sources || []).slice(0, 2).map((x) => x.node ? `${x.node.nodeName}.${(x.node.className?.toString?.() || '').slice(0, 24)} y${Math.round(x.previousRect.y)}→${Math.round(x.currentRect.y)} h${Math.round(x.previousRect.height)}→${Math.round(x.currentRect.height)}` : '?') }); })).observe({ type: 'layout-shift', buffered: true }); } catch {}
  // Heap is sampled IN-PAGE (performance.memory, Chromium): polling CDP Performance.getMetrics
  // during a gesture janks the very frames being measured (it inflated fling p95 to 33ms).
  P.heap = 0;
  setInterval(() => { const m = performance.memory; if (m) P.heap = Math.max(P.heap, m.usedJSHeapSize); }, 250);
  P.reset = () => { P.frames = []; P.lt = []; P.cls = 0; P.shifts = []; P.last = 0; P.t0 = performance.now(); P.heap = performance.memory?.usedJSHeapSize || 0; };
  P.reset();
  // tab-paint probe: time from the tab tap to the first frame painted after the new route commits
  window.__tabTap = 0;
  document.addEventListener('pointerdown', (e) => { if (e.target.closest?.('.footer-pill a')) window.__tabTap = performance.now(); }, true);
};

const pctl = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const r1 = (n) => Math.round(n * 10) / 10;

async function newSession(profile) {
  // precise-memory-info: unbucketed performance.memory (the heap readout). No CDP Performance
  // domain — enabling it adds per-frame overhead to the frames being measured.
  const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
  const ctx = await browser.newContext(profile === 'mobile'
    ? { ...devices['iPhone 13'], viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, storageState: 'test/.auth/state.json' }
    : { viewport: { width: 1440, height: 900 }, storageState: 'test/.auth/state.json' });
  await ctx.addInitScript(COLLECTOR);
  // GATE_CSS: inject an experimental stylesheet (A/B a rendering fix before shipping it).
  if (process.env.GATE_CSS) await ctx.addInitScript((css) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }); }, process.env.GATE_CSS);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (profile === 'mobile') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return { browser, ctx, page, cdp };
}

async function heapMB(page) {
  return (await page.evaluate(() => performance.memory?.usedJSHeapSize || 0)) / 1048576;
}

// Run `fn` while sampling heap; return the in-page metrics for that window.
async function measure(page, cdp, fn) {
  // Start each scenario from a SETTLED page (no long task in the last 2s, max 12s) so one
  // scenario's cost isn't the previous load still finishing. Page-load cost has its own row.
  await page.waitForFunction(() => { const lt = window.__perf.lt; const last = lt.length ? Math.max(...lt.map((e) => e.s + e.d)) : 0; return performance.now() - last > 2000; }, null, { timeout: 12000, polling: 250 }).catch(() => {});
  await page.evaluate(() => window.__perf.reset());
  // PROFILE=1: CPU-profile the scenario and name what runs INSIDE its long tasks.
  let pnow0 = 0;
  if (process.env.PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start'); pnow0 = await page.evaluate(() => performance.now()); }
  const extra = (await fn()) || {};
  await page.waitForTimeout(300);
  if (process.env.PROFILE) {
    const { profile } = await cdp.send('Profiler.stop');
    const lts = await page.evaluate(() => window.__perf.lt.map((e) => [e.s, e.d]));
    const byId = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map(); let t = profile.startTime;
    profile.samples.forEach((id, i) => {
      t += profile.timeDeltas[i] || 0;
      const ms = pnow0 + (t - profile.startTime) / 1000; // profile µs → page ms (anchored at start, ±a few ms)
      if (!lts.some(([s0, d]) => ms >= s0 && ms <= s0 + d)) return;
      const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}:${n.callFrame.columnNumber}`;
      self.set(k, (self.get(k) || 0) + (profile.timeDeltas[i] || 0) / 1000);
    });
    extra.ltProfile = [...self.entries()].filter(([k]) => !/^\((idle|program)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${v.toFixed(1)}ms ${k}`);
  }
  const p = await page.evaluate(() => ({ frames: window.__perf.frames, lt: window.__perf.lt, cls: window.__perf.cls, heap: window.__perf.heap, shifts: window.__perf.shifts }));
  const peak = p.heap / 1048576;
  const frames = p.frames.filter((f) => f < 2000); // drop backgrounded gaps
  return {
    longTasks: p.lt.length, longTaskMs: Math.round(p.lt.reduce((a, b) => a + b.d, 0)),
    p95: r1(pctl(frames, 0.95)), max: r1(Math.max(0, ...frames)), over50: frames.filter((f) => f > 50).length, frames: frames.length,
    cls: Math.round(p.cls * 1000) / 1000, heapPeakMB: r1(peak), ...(p.shifts.length ? { shifts: p.shifts.slice(0, 6) } : {}), ...extra,
  };
}

const fling = (cdp, x, y, dy, speed = 4000) => cdp.send('Input.synthesizeScrollGesture', { x, y, yDistance: dy, speed, gestureSourceType: 'touch', repeatCount: 1 });
async function revealChrome(cdp, profile) { if (profile === 'mobile') { await fling(cdp, 187, 400, 60, 800); } }

async function scenarios(profile) {
  const W = profile === 'mobile' ? 375 : 1440, H = profile === 'mobile' ? 812 : 900;
  const out = {};

  // 1 ─ cold load of / on simulated 4G, cache disabled
  {
    const { browser, page, cdp } = await newSession(profile);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    const reqs = new Map(); let bytes = 0, count = 0;
    cdp.on('Network.requestWillBeSent', (e) => { count++; reqs.set(e.requestId, { url: e.request.url, type: e.type, decoded: 0, enc: 0 }); });
    cdp.on('Network.dataReceived', (e) => { const r = reqs.get(e.requestId); if (r) r.decoded += e.dataLength; });
    cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; const r = reqs.get(e.requestId); if (r) r.enc = e.encodedDataLength; });
    const t0 = Date.now();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    // TTI (Lighthouse-style, network-quiet clause dropped): after FCP, the end of the last
    // long task before a 5s window with none. Capped at 30s.
    let tti = null;
    for (;;) {
      await page.waitForTimeout(500);
      const s = await page.evaluate(() => {
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0;
        const lt = window.__perf.lt.filter((e) => e.s + e.d > fcp);
        const lastEnd = lt.length ? Math.max(...lt.map((e) => e.s + e.d)) : fcp;
        return { now: performance.now(), fcp, lastEnd, feed: !!document.querySelector('.feed-card') };
      });
      if (s.fcp && s.feed && s.now - s.lastEnd >= 5000) { tti = Math.max(s.fcp, s.lastEnd); break; }
      if (Date.now() - t0 > 30000) { tti = null; break; }
    }
    const p = await page.evaluate(() => ({ lt: window.__perf.lt, cls: window.__perf.cls, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0 }));
    const js = [...reqs.values()].filter((r) => /\.js(\?|$)/.test(r.url) && r.decoded > 0).sort((a, b) => b.decoded - a.decoded).slice(0, 5)
      .map((r) => ({ chunk: r.url.replace(/^.*\/_next\/static\//, ''), kb: Math.round(r.decoded / 1024), transferKb: Math.round(r.enc / 1024) }));
    out.coldLoad = {
      ttiMs: tti && Math.round(tti), fcpMs: Math.round(p.fcp), longTasks: p.lt.length, longTaskMs: Math.round(p.lt.reduce((a, b) => a + b.d, 0)),
      cls: Math.round(p.cls * 1000) / 1000, requests: count, transferKB: Math.round(bytes / 1024), heapPeakMB: r1(await heapMB(page)), heaviestJs: js,
    };
    await browser.close();
  }

  const { browser, page, cdp } = await newSession(profile);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.feed-card', { timeout: 30000 });
  await page.waitForTimeout(2500);

  // 2 ─ feed fling, 3 screens down
  out.feedFling = await measure(page, cdp, async () => { await fling(cdp, W / 2, H * 0.7, -H * 3, 5000); await page.waitForTimeout(1200); });

  // 3 ─ tab switch ×5 (mobile pill; desktop rail)
  if (profile === 'mobile') {
    await revealChrome(cdp, profile); await page.waitForTimeout(400);
    const tabs = ['Direct messages', 'Wallet', 'Home', 'Notifications', 'Home'];
    const paints = [];
    out.tabSwitch = await measure(page, cdp, async () => {
      for (const t of tabs) {
        const before = page.url();
        await page.tap(`.footer-pill a[aria-label="${t}"]`);
        await page.waitForFunction((b) => location.href !== b, before, { timeout: 10000 });
        // first frame painted after the route commit (two rAFs after the URL flips)
        const ms = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - window.__tabTap)))));
        paints.push(Math.round(ms));
        await page.waitForTimeout(900);
      }
      return { tabPaintMs: paints, tabPaintMax: Math.max(...paints) };
    });
  } else {
    // Desktop rail: Messages, Wallet, Home, Profile, Home (client-side nav, like a click)
    const tabs = [['Messages', '/dm'], ['Wallet', '/wallet'], ['Home', '/'], ['Profile', '/profile'], ['Home', '/']];
    const paints = [];
    out.tabSwitch = await measure(page, cdp, async () => {
      for (const [label, to] of tabs) {
        const t0 = await page.evaluate(() => performance.now());
        await page.click(`nav[aria-label="Primary"] [aria-label="${label}"]`);
        await page.waitForURL(BASE + to, { timeout: 15000 });
        const ms = await page.evaluate((t0) => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t0)))), t0);
        paints.push(Math.round(ms));
        await page.waitForTimeout(900);
      }
      return { tabPaintMs: paints, tabPaintMax: Math.max(...paints) };
    });
  }

  // 4 ─ open a post lightbox (tap the first card's media)
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForSelector('.feed-card'); await page.waitForTimeout(2000);
  out.lightbox = await measure(page, cdp, async () => {
    const box = await page.evaluate(() => {
      for (const card of document.querySelectorAll('.feed-card')) {
        for (const el of card.querySelectorAll('div')) { const r = el.getBoundingClientRect(); if (getComputedStyle(el).cursor === 'pointer' && r.height > 100 && r.top > 0 && r.bottom < innerHeight) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      }
      return null;
    });
    if (!box) return { note: 'no tappable card media on screen' };
    if (profile === 'mobile') await page.touchscreen.tap(box.x, box.y); else await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(1500);
  });

  // 5 ─ open a profile (tap the first card's author)
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForSelector('.feed-card'); await page.waitForTimeout(2000);
  out.openProfile = await measure(page, cdp, async () => {
    const before = page.url();
    const a = page.locator('.feed-card button.tappable').first();
    if (profile === 'mobile') await a.tap(); else await a.click();
    await page.waitForFunction((b) => location.href !== b, before, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    return { url: new URL(page.url()).pathname };
  });

  // 6 ─ music library browse scroll
  await page.goto(BASE + '/library', { waitUntil: 'networkidle' }); await page.waitForSelector('.wf-row'); await page.waitForTimeout(1500);
  out.musicScroll = await measure(page, cdp, async () => { await fling(cdp, W / 2, H * 0.7, -H * 3, 4000); await page.waitForTimeout(1200); });

  // 7 ─ open the create flow
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  out.createFlow = await measure(page, cdp, async () => {
    if (profile === 'mobile') await page.tap('.footer-pill a[aria-label="Create post"]');
    else await page.evaluate(() => (location.href = '/create'));
    await page.waitForURL(/\/create/, { timeout: 15000 }); await page.waitForTimeout(2500);
  });

  // 8 ─ heap across a feed session (mobile): GC'd heap at start vs end of N minutes of flings
  if (profile === 'mobile' && HEAP_MIN > 0) {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForSelector('.feed-card'); await page.waitForTimeout(2000);
    await cdp.send('HeapProfiler.enable');
    const gcHeap = async () => { await cdp.send('HeapProfiler.collectGarbage'); return heapMB(page); };
    const start = await gcHeap(); const samples = [r1(start)];
    const t0 = Date.now(); let i = 0;
    while (Date.now() - t0 < HEAP_MIN * 60000) {
      await fling(cdp, W / 2, H * 0.7, (i++ % 4 === 3 ? 1 : -1) * H * 2, 4000);
      await page.waitForTimeout(1500);
      if (i % 20 === 0) samples.push(r1(await gcHeap()));
    }
    const end = await gcHeap(); samples.push(r1(end));
    out.heapSession = { minutes: HEAP_MIN, startMB: r1(start), endMB: r1(end), growthMB: r1(end - start), samplesMB: samples };
  }
  await browser.close();
  return out;
}

// ── Brief M22 — SCROLL-TRAP SWEEP ───────────────────────────────────────────────
// html/body are locked (position:fixed, overflow:hidden, 100dvh), so a page whose root is a
// plain min-height block can't scroll — its content is clipped below the fold. For every route
// that renders a list or long content: if content extends past the viewport, a real scroller
// (overflow-y auto/scroll) must exist, a programmatic scroll must move it, and scrolling it to
// the end must bring the last content into view. Closed sheets (content under a non-scrolling
// fixed layer) are ignored.
const TRAP_ROUTES = [
  '/', '/profile', '/profile/{user}', '/profile/{user}/decks', '/profile/{user}/decks/{deck}',
  '/profile/notifications', '/dm', '/dm/{dmuser}', '/library', '/composer/{user}', '/wallet',
  '/earnings', '/badges', '/first-cut/{user}', '/membership/manage',
  '/profile/preferences', '/profile/account', '/profile/data', '/profile/invite', '/profile/hidden',
  '/profile/contact', '/profile/links', '/profile/edit', '/profile/delete-account', '/terms', '/privacy',
];
const TRAP_PROBE = async () => {
  const H = innerHeight, frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const isScroller = (el) => { const o = getComputedStyle(el).overflowY; return (o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 4; };
  // content under a fixed layer that is not itself a scroller = a sheet/overlay → not page content
  // Page content unless it sits in an overlay: walking up, a FIXED layer that is off-screen (a
  // closed sheet), small (toast/chip) or invisible → overlay, even if it scrolls; otherwise the
  // nearest scroller / full-screen fixed box → page content. A full-screen fixed non-scroller
  // still counts — content clipped inside it IS a trap.
  // Also intentional clipping: an element cut off by a SMALL overflow:hidden box (a card, a
  // carousel, a clamp) isn't page content; a viewport-sized clipping box still counts (a trap).
  const inSheet = (el) => { const er = el.getBoundingClientRect(); for (let a = el; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.visibility === 'hidden' || cs.opacity === '0') return true; if (cs.position === 'fixed') { const r = a.getBoundingClientRect(); if (r.top >= H - 1 || r.bottom <= 1 || r.height < H * 0.5) return true; /* closed sheet / toast — even if it scrolls */ } if (isScroller(a)) return false; if (a !== el && (cs.overflowY === 'hidden' || cs.overflowY === 'clip')) { const r = a.getBoundingClientRect(); if (r.height < H * 0.9 && er.bottom > r.bottom + 2) return true; } if (cs.position === 'fixed') return false; } return false; };
  const extent = () => { let m = 0, last = null; for (const el of document.body.querySelectorAll('*')) { if (el.closest('.footer-pill, nav[aria-label="Primary"], .launch-cue')) continue; const r = el.getBoundingClientRect(); if (!r.height || !r.width || inSheet(el)) continue; if (r.bottom > m) { m = r.bottom; last = el; } } return { bottom: Math.round(m), last }; };
  const before = extent();
  if (before.bottom <= H + 4) return { status: 'fits', bottom: before.bottom };
  const scrollers = [...document.querySelectorAll('*')].filter((el) => isScroller(el) && el.clientHeight >= H * 0.4).sort((a, b) => b.clientHeight - a.clientHeight);
  const desc = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}${el.hasAttribute('data-scroll') ? '[data-scroll]' : ''}`;
  if (!scrollers.length) return { status: 'TRAP', bottom: before.bottom, why: `content to y=${before.bottom} (viewport ${H}), no overflow-y:auto scroller — last: ${desc(before.last)}` };
  const sc = scrollers[0], top0 = sc.scrollTop;
  sc.scrollTop = 200; await frame(); const moved = sc.scrollTop !== top0;
  sc.scrollTop = sc.scrollHeight; await frame();
  const after = extent(); sc.scrollTop = top0; await frame();
  const reached = after.bottom <= H + 4;
  return { status: moved && reached ? 'scrolls' : moved ? 'PARTIAL' : 'TRAP', scroller: desc(sc), bottom: before.bottom, endBottom: after.bottom, why: !moved ? 'scroller did not move' : !reached ? `after scrolling to end, content still to y=${after.bottom} — last: ${desc(after.last)}` : '' };
};
async function scrollTraps(profile) {
  const { browser, page } = await newSession(profile);
  // resolve route params from live data
  await page.goto(BASE + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  // the composer handle exactly as the app links it: tap a library row's composer link
  let user = 'overtone';
  const handleBtn = page.locator('button', { hasText: /^@\w/ }).first();
  if (await handleBtn.count()) { await handleBtn.click(); await page.waitForURL(/\/composer\//, { timeout: 10000 }).catch(() => {}); const m = new URL(page.url()).pathname.match(/^\/composer\/(.+)$/); if (m) user = decodeURIComponent(m[1]); }
  await page.goto(BASE + `/profile/${user}/decks`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  const deck = await page.evaluate(() => [...document.querySelectorAll('a[href*="/decks/"]')].map((a) => a.getAttribute('href').split('/decks/')[1])[0]);
  await page.goto(BASE + '/dm', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  const dmuser = await page.evaluate(() => [...document.querySelectorAll('a[href^="/dm/"]')].map((a) => a.getAttribute('href').slice(4))[0]);
  const rows = [];
  for (const tpl of TRAP_ROUTES) {
    if ((tpl.includes('{deck}') && !deck) || (tpl.includes('{dmuser}') && !dmuser)) { rows.push({ route: tpl, status: 'skip', why: 'no live id' }); continue; }
    const route = tpl.replace('{user}', user).replace('{deck}', deck).replace('{dmuser}', dmuser);
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const landed = new URL(page.url()).pathname;
    const r = await page.evaluate(TRAP_PROBE).catch((e) => ({ status: 'error', why: String(e).slice(0, 80) }));
    rows.push({ route, landed: landed !== route ? landed : undefined, ...r });
  }
  await browser.close();
  return rows;
}

function verdicts(m) {
  const v = {};
  if (m.feedFling) v.feedFling = m.feedFling.p95 <= BUDGET.fling.p95 + 0.15 /* rAF granularity: one 60Hz vsync reads 16.7–16.8 */ && m.feedFling.over50 <= BUDGET.fling.over50;
  if (m.tabSwitch) v.tabSwitch = m.tabSwitch.tabPaintMax <= BUDGET.tabPaintMs;
  v.cls = Object.values(m).every((s) => s?.cls === undefined || s.cls <= BUDGET.cls);
  if (m.coldLoad) { v.coldTTI = m.coldLoad.ttiMs !== null && m.coldLoad.ttiMs <= BUDGET.ttiMs; v.coldLongTasks = m.coldLoad.longTasks <= BUDGET.longTasksPerLoad; }
  if (m.openProfile) v.profileLongTasks = m.openProfile.longTasks <= BUDGET.longTasksPerLoad;
  if (m.createFlow) v.createLongTasks = m.createFlow.longTasks <= BUDGET.longTasksPerLoad;
  if (m.heapSession) v.heapSteady = m.heapSession.growthMB <= 2;
  if (m.scrollTraps) v.noScrollTraps = m.scrollTraps.every((r) => r.status === 'fits' || r.status === 'scrolls' || r.status === 'skip');
  return v;
}

function table(res, prev) {
  const rows = [];
  for (const prof of Object.keys(res)) {
    for (const [sc, m] of Object.entries(res[prof])) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
      const p = prev?.[prof]?.[sc];
      const f = (k, unit = '') => (m[k] === undefined || m[k] === null ? '–' : `${m[k]}${unit}`) + (p && p[k] !== undefined && p[k] !== m[k] ? ` (was ${p[k]})` : '');
      rows.push(`| ${prof} | ${sc} | ${f('longTasks')} / ${f('longTaskMs', 'ms')} | ${f('p95', 'ms')} / ${f('max', 'ms')} | ${f('cls')} | ${sc === 'coldLoad' ? f('ttiMs', 'ms') : sc === 'tabSwitch' ? `paint ${JSON.stringify(m.tabPaintMs)}` : '–'} | ${sc === 'heapSession' ? `${m.startMB}→${m.endMB} MB` : f('heapPeakMB', 'MB')} | ${sc === 'coldLoad' ? `${m.requests} req / ${m.transferKB} KB` : '–'} |`);
    }
  }
  return ['| profile | scenario | long tasks (n / ms) | frame p95 / max | CLS | TTI / tab paint | heap | cold requests / bytes |', '|---|---|---|---|---|---|---|---|', ...rows].join('\n');
}

const res = {};
for (const prof of ['mobile', 'desktop']) {
  if (ONLY && ONLY !== prof) continue;
  console.error(`… ${prof}`);
  res[prof] = TRAPS_ONLY ? {} : await scenarios(prof);
  res[prof].scrollTraps = await scrollTraps(prof);
}
const prev = COMPARE && existsSync(`${OUT_DIR}/${COMPARE}.json`) ? JSON.parse(readFileSync(`${OUT_DIR}/${COMPARE}.json`, 'utf8')).results : null;
const report = { label: LABEL, base: BASE, at: new Date().toISOString(), results: res, verdicts: Object.fromEntries(Object.entries(res).map(([k, m]) => [k, verdicts(m)])) };
writeFileSync(`${OUT_DIR}/${LABEL}.json`, JSON.stringify(report, null, 2));
console.log(table(res, prev));
for (const prof of Object.keys(res)) {
  console.log(`\n${prof} scroll-trap sweep (375 / 1440):`);
  console.log('| route | status | scroller | detail |\n|---|---|---|---|');
  for (const r of res[prof].scrollTraps) console.log(`| ${r.route}${r.landed ? ` → ${r.landed}` : ''} | ${r.status} | ${r.scroller || '–'} | ${r.why || (r.bottom ? `content to y=${r.bottom}` : '')} |`);
  if (res[prof].coldLoad) {
    console.log(`\n${prof} heaviest JS (cold load, decoded KB / transfer KB):`);
    for (const c of res[prof].coldLoad.heaviestJs) console.log(`  ${c.kb} / ${c.transferKb}  ${c.chunk}`);
  }
  console.log(`${prof} budget: ${JSON.stringify(report.verdicts[prof])}`);
}
