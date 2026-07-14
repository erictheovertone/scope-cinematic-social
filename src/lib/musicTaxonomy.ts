// ── src/lib/musicTaxonomy.ts — the keyword taxonomy (DATA, not code) ──────────
// The controlled vocabulary a composer tags a track with, grouped for the picker.
// Expandable: add words here, no code change. Contributors pick 2–6 total (across
// any groups). M2 discovery filters against the same list (GIN index on keywords).

export interface TaxonomyGroup {
  label: string;
  words: string[];
}

export const MUSIC_TAXONOMY: TaxonomyGroup[] = [
  {
    label: 'MOOD',
    words: [
      'cinematic', 'uplifting', 'melancholy', 'tense', 'dreamy', 'nostalgic',
      'triumphant', 'brooding', 'playful', 'intimate', 'epic', 'haunting',
      'warm', 'cold', 'defiant', 'serene',
    ],
  },
  {
    label: 'ENERGY',
    words: ['ambient', 'slow-burn', 'driving', 'pulsing', 'explosive', 'building', 'restrained'],
  },
  {
    label: 'GENRE',
    words: [
      'score', 'neo-classical', 'electronic', 'indie', 'folk', 'post-rock',
      'hip-hop', 'jazz', 'experimental', 'synthwave', 'orchestral',
    ],
  },
  {
    label: 'TEXTURE',
    words: ['piano', 'strings', 'synths', 'guitar', 'percussion-led', 'vocal', 'drone', 'lo-fi', 'analog'],
  },
];

// Flat set — for validating that submitted keywords are in-vocabulary.
export const MUSIC_KEYWORDS: string[] = MUSIC_TAXONOMY.flatMap((g) => g.words);
export const MUSIC_KEYWORDS_SET = new Set(MUSIC_KEYWORDS);

// Selection bounds (both platforms enforce; the submit route re-checks).
export const KEYWORDS_MIN = 2;
export const KEYWORDS_MAX = 6;

// Upload constraints — reported here so client + server agree.
export const AUDIO_MAX_BYTES = 15 * 1024 * 1024; // ~15MB
export const AUDIO_MAX_SECONDS = 6 * 60;          // ~6min
export const AUDIO_MIME_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/aac': 'aac',
  'audio/mp4': 'aac',
  'audio/x-m4a': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
};

export const TITLE_MAX = 80;

// The license the contributor acknowledges (checkbox-gated). Ships now; lawyer pass
// later — do not paraphrase without approval.
export const MUSIC_LICENSE_COPY =
  'By contributing, you confirm you own this music and grant Scope a ' +
  'non-exclusive, royalty-free license to host it and let Scope users feature it ' +
  'in their posts. You keep full ownership and can request removal anytime. ' +
  'Approved contributors earn the COMPOSER badge.';
