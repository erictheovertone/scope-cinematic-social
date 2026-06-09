/**
 * Look catalog — data-driven manifest of built-in .cube looks (Brief: Look Palette).
 * Mapping confirmed against /public/luts (folder-structure buckets; SOOT.cube is
 * the B&W second look). Adding the later signature looks = appending data here,
 * no code changes. ALL built-in looks are Pro (gated on apply).
 */

export type LookBucket =
  | 'B&W' | 'CINEMA' | 'COLOR NEGATIVE' | 'MUTED' | 'SATURATED' | 'ARCHIVAL' | 'SLIDE';

export interface LookDef {
  id: string;        // stable id stored in EditParams.lutId
  name: string;      // display name (one word)
  bucket: LookBucket;
  file: string;      // /luts/... (encodeURI'd at fetch time)
}

// Display order of buckets in the Palette.
export const LOOK_BUCKETS: LookBucket[] = ['B&W', 'CINEMA', 'COLOR NEGATIVE', 'MUTED', 'SATURATED', 'ARCHIVAL', 'SLIDE'];

export const LOOKS: LookDef[] = [
  { id: 'soot',        name: 'SOOT',        bucket: 'B&W',            file: '/luts/__B&W/SOOT.cube' },
  { id: 'obsidian',    name: 'OBSIDIAN',    bucket: 'B&W',            file: '/luts/__B&W/OBSIDIAN.cube' },

  { id: 'auteur',      name: 'AUTEUR',      bucket: 'CINEMA',         file: '/luts/__CINEMA/AUTEUR.cube' },
  { id: 'matinee',     name: 'MATINEE',     bucket: 'CINEMA',         file: '/luts/__CINEMA/MATINEE.cube' },
  { id: 'drifter',     name: 'DRIFTER',     bucket: 'CINEMA',         file: '/luts/__CINEMA/DRIFTER.cube' },
  { id: 'meridian',    name: 'MERIDIAN',    bucket: 'CINEMA',         file: '/luts/__CINEMA/MERIDIAN.cube' },

  { id: 'emulsion55',  name: 'EMULSION 55', bucket: 'COLOR NEGATIVE', file: '/luts/__COLOR NEGATIVE/EMULSION-55.cube' },
  { id: 'emulsion60',  name: 'EMULSION 60', bucket: 'COLOR NEGATIVE', file: '/luts/__COLOR NEGATIVE/EMULSION-60.cube' },
  { id: 'emulsion65',  name: 'EMULSION 65', bucket: 'COLOR NEGATIVE', file: '/luts/__COLOR NEGATIVE/EMULSION-65.cube' },

  { id: 'gotham',      name: 'GOTHAM',      bucket: 'MUTED',          file: '/luts/__MUTED/GOTHAM.cube' },

  { id: 'blockbuster', name: 'BLOCKBUSTER', bucket: 'SATURATED',      file: '/luts/__SATURATED/BLOCKBUSTER.cube' },
  { id: 'refract',     name: 'REFRACT',     bucket: 'SATURATED',      file: '/luts/__SATURATED/REFRACT.cube' },
  { id: 'definitive',  name: 'DEFINITIVE',  bucket: 'SATURATED',      file: '/luts/__SATURATED/DEFINITIVE.cube' },
  { id: 'stark',       name: 'STARK',       bucket: 'SATURATED',      file: '/luts/__SATURATED/STARK.cube' },

  { id: 'vault',       name: 'VAULT',       bucket: 'ARCHIVAL',       file: '/luts/ARCHIVAL LOOKS/VAULT.cube' },
  { id: 'chronicle',   name: 'CHRONICLE',   bucket: 'ARCHIVAL',       file: '/luts/ARCHIVAL LOOKS/CHRONICLE.cube' },

  { id: 'apex',        name: 'APEX',        bucket: 'SLIDE',          file: '/luts/__SLIDE/APEX.cube' },
  { id: 'soar',        name: 'SOAR',        bucket: 'SLIDE',          file: '/luts/__SLIDE/SOAR.cube' },
];

export const lookById = (id: string | null): LookDef | undefined => (id ? LOOKS.find((l) => l.id === id) : undefined);
export const looksByBucket = (b: LookBucket): LookDef[] => LOOKS.filter((l) => l.bucket === b);
