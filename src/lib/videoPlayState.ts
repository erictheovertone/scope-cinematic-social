// ── videoPlayState — HOME-2 §5 play-health store for the ?debug=video overlay ────────────────────
// Each autoplay GradedVideo reports {inView, playing, errored}; the overlay reads playSummary() for
// one phone-readable line: `play: in-view N · playing M · waiting K · gave-up G`.
//   N = cards in view · M = playing · K = in view, trying, not yet playing · G = in view but gave up.
// Byte-inert until a card registers. Module-level, like vdbgLiveCounts / videoGfx.
type PlayState = { inView: boolean; playing: boolean; errored: boolean };

const cards = new Map<string, PlayState>();

export function setPlayState(id: string, s: PlayState): void { cards.set(id, s); }
export function clearPlayState(id: string): void { cards.delete(id); }

export function playSummary(): string {
  let inView = 0, playing = 0, waiting = 0, gaveUp = 0;
  for (const s of cards.values()) {
    if (!s.inView) continue;
    inView++;
    if (s.errored) gaveUp++;
    else if (s.playing) playing++;
    else waiting++;
  }
  return `in-view ${inView} · playing ${playing} · waiting ${waiting} · gave-up ${gaveUp}`;
}
