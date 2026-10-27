// ── The script wordmark's ink box (Brief U2-2) ──────────────────────────────────
// Birds of Paradise overhangs its own text box: the "s" swash ~0.17em left of it, the "e" tail
// past the right edge, the "p" descender below a 0.85 line-height. Painted inline that's fine,
// but the moment WebKit gives the span its own layer (the opacity fade-in; iOS keeps it), the
// layer is cropped to the box and the mark is cut off. Pad the box out to the ink and cancel the
// padding with equal negative margins, so the layer holds every glyph and the lockup doesn't move.
import type { CSSProperties } from 'react';

export const WORDMARK_INK_BOX: CSSProperties = {
  padding: '0.2em 0.12em 0.3em 0.25em',
  margin: '-0.2em -0.12em -0.3em -0.25em',
};
