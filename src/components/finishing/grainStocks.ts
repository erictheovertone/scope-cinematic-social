/**
 * GRAIN_STOCKS — the 12 real scanned film-grain stills (3 gauges × 4 densities).
 *
 * Built from the actual files in /public/grain (read in Brief 4 Step 0). The
 * files are numbered 1–4 per gauge; confirmed mapping 1=FINE → 4=HEAVY.
 * All stills are 1920×1080 (16:9), grain-on-grey (so OVERLAY blend maps mid-grey
 * → no-op and lets the grain structure through).
 */

export type GrainGauge = '8MM' | '16MM' | '35MM';
export type GrainDensity = 'FINE' | 'LIGHT' | 'MEDIUM' | 'HEAVY';

export interface GrainStock {
  key: string;          // stable id stored in EditParams.grainStock
  gauge: GrainGauge;
  density: GrainDensity;
  file: string;         // /grain/<actual filename>
}

/** Native aspect of every still (1920×1080). Used for cover-scaling the overlay. */
export const GRAIN_ASPECT = 1920 / 1080;

const GAUGES: { gauge: GrainGauge; prefix: string }[] = [
  { gauge: '8MM', prefix: '8mm' },
  { gauge: '16MM', prefix: '16mm' },
  { gauge: '35MM', prefix: '35mm' },
];

// File number → density (confirmed: ascending number = increasing density).
const DENSITY_BY_NUM: GrainDensity[] = ['FINE', 'LIGHT', 'MEDIUM', 'HEAVY']; // index 0 → file __1

export const GRAIN_STOCKS: GrainStock[] = GAUGES.flatMap(({ gauge, prefix }) =>
  DENSITY_BY_NUM.map((density, i) => ({
    key: `${prefix}_${i + 1}`,
    gauge,
    density,
    file: `/grain/${prefix}__${i + 1}.png`,
  })),
);

export const grainStockByKey = (key: string | null): GrainStock | undefined =>
  key ? GRAIN_STOCKS.find((s) => s.key === key) : undefined;

/** Stocks for one gauge row, FINE → HEAVY. */
export const grainStocksForGauge = (gauge: GrainGauge): GrainStock[] =>
  GRAIN_STOCKS.filter((s) => s.gauge === gauge);

export const GRAIN_GAUGES: GrainGauge[] = ['8MM', '16MM', '35MM'];
