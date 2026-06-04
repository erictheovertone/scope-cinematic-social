export type UpsellLimit = 'posts' | 'decks' | 'links';

export function getScopeLimitType(e: any): UpsellLimit | null {
  const s = `${e?.message ?? ''} ${e?.details ?? ''} ${e?.hint ?? ''}`;
  if (s.includes('SCOPE_LIMIT_POSTS')) return 'posts';
  if (s.includes('SCOPE_LIMIT_DECKS')) return 'decks';
  if (s.includes('SCOPE_LIMIT_LINKS')) return 'links';
  return null;
}
