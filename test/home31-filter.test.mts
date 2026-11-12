// HOME-3.1 Part A — unit check for videoCssFilter's B&W-LUT grayscale.
// Run: node_modules/.bin/tsx test/home31-filter.test.mts
import * as VG from "@/lib/editor/videoGrade";
import type { EditParams } from "@/lib/editor/params";
// tsx wraps the CJS module under `default`; fall back across both interop shapes.
const mod = (VG as unknown as { videoCssFilter?: typeof import("@/lib/editor/videoGrade").videoCssFilter; default?: { videoCssFilter: typeof import("@/lib/editor/videoGrade").videoCssFilter } });
const videoCssFilter = mod.videoCssFilter ?? mod.default!.videoCssFilter;

// videoCssFilter reads only these fields; a minimal object (cast) exercises it faithfully.
const P = (over: { lutId?: string | null; lutIntensity?: number; exposure?: number; contrast?: number; saturation?: number; blur?: number; whiteBalance?: { t?: number } }): EditParams =>
  ({ exposure: 0, contrast: 0, saturation: 0, blur: 0, whiteBalance: { t: 0 }, lutId: null, lutIntensity: 0, ...over } as unknown as EditParams);
let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  → ${JSON.stringify(got)}${ok ? "" : ` (want ${JSON.stringify(want)})`}`);
  if (!ok) fail++;
};
const has = (label: string, got: string | undefined, needle: string) => {
  const ok = !!got && got.includes(needle);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  → ${JSON.stringify(got)}${ok ? "" : ` (want contains ${JSON.stringify(needle)})`}`);
  if (!ok) fail++;
};

// B&W LUT at full intensity → grayscale(1)
eq("soot@12 → grayscale(1.000)", videoCssFilter(P({ lutId: "soot", lutIntensity: 12 })), "grayscale(1.000)");
// Half intensity → grayscale(0.5)
eq("soot@6 → grayscale(0.500)", videoCssFilter(P({ lutId: "soot", lutIntensity: 6 })), "grayscale(0.500)");
// Obsidian (also B&W) full → grayscale(1)
eq("obsidian@12 → grayscale(1.000)", videoCssFilter(P({ lutId: "obsidian", lutIntensity: 12 })), "grayscale(1.000)");
// No look → unchanged (undefined when no numeric params either)
eq("no look → undefined", videoCssFilter(P({ lutId: null, lutIntensity: 0 })), undefined);
// Non-B&W LUT alone → NO grayscale (no single-filter stand-in) → undefined
eq("auteur@12 (CINEMA) → undefined", videoCssFilter(P({ lutId: "auteur", lutIntensity: 12 })), undefined);
// B&W grayscale composes WITH the numeric params, grayscale first.
has("soot@12 + saturation keeps grayscale first", videoCssFilter(P({ lutId: "soot", lutIntensity: 12, saturation: 3 })), "grayscale(1.000) ");
// lutIntensity 0 with a B&W lutId (look disabled) → no grayscale.
eq("soot@0 → undefined", videoCssFilter(P({ lutId: "soot", lutIntensity: 0 })), undefined);

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
