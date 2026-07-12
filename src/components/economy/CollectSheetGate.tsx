'use client';
// ── CollectSheetGate ─────────────────────────────────────────────────────────
//
// Single switch point for the collect sheet. With the economy preview flag ON,
// renders the mock-data CollectSheetV2 (Part 2.4). With the flag OFF, renders
// the existing, real CollectSheet — so the app behaves EXACTLY as today.
// Call sites swap <CollectSheet> → <CollectSheetGate> (identical props).

import CollectSheet from '@/components/CollectSheet';
import CollectSheetV2 from '@/components/economy/CollectSheetV2';
import NotCollectibleSheet from '@/components/economy/NotCollectibleSheet';
import { economyPreviewEnabled } from '@/lib/economy/flag';
import { isCoinPost } from '@/components/EconomyProvider';
import { isUntradeableCoin } from '@/lib/economy/pairing';

type CollectSheetProps = React.ComponentProps<typeof CollectSheet>;

export default function CollectSheetGate(props: CollectSheetProps) {
  // UNMINTED GATE (fix): a post with no coin (Coins) and no legacy 1155 token has
  // nothing to read — sending it to a market sheet fires coin reads against a null
  // address and crashes. Intercept it here, before ANY market/collect sheet, with the
  // quiet explainer. (Covers the preview-flag path too — unminted is never collectible.)
  {
    const p = props.post as Record<string, unknown>;
    const hasCoin = !!(p.coin_address as string | null);
    const legacyMinted = !!p.is_minted && !!(p.contract_address as string | null);
    if (!hasCoin && !legacyMinted) {
      return <NotCollectibleSheet visible={props.visible} onClose={props.onClose} />;
    }
  }
  // Market sheet (v2) shows for real COIN posts (production legacy gate), OR
  // under the dev preview flag on mock data (skeleton testing). Legacy 1155
  // posts in production (flag off, no coin_address) fall through to the existing
  // collectible sheet — no market UI, per §9.
  if (economyPreviewEnabled() || isCoinPost(props.post as { coin_address?: string | null; token_standard?: string | null })) {
    const { post, visible, onClose } = props;
    const p = post as Record<string, unknown>;
    // Legacy ETH-paired coins are unroutable → non-tradeable. Detected by the
    // stored pairing here; the sheet keeps the post head, drops the BUY/SELL UI.
    const tradeable = !isUntradeableCoin({
      coin_address: (p.coin_address as string | null) ?? null,
      coin_currency: (p.coin_currency as string | null) ?? null,
    });
    return (
      <CollectSheetV2
        post={(() => { return {
          id: post.id, username: post.username, caption: post.caption, media_urls: post.media_urls,
          ticker: (p.ticker as string | null) ?? null,
          media_type: (p.media_type as string | undefined),
          poster_url: (p.poster_url as string | null) ?? null,
          thumbnail_url: (p.thumbnail_url as string | null) ?? null,
          layout_id: (p.layout_id as string | undefined),
          // Forwarded so the sheet plays GRADED video (same params as the feed).
          edit_params: p.edit_params,
          autoplay_clip_url: (p.autoplay_clip_url as string | null) ?? null,
          crop_x: (p.crop_x as number | undefined),
          crop_y: (p.crop_y as number | undefined),
          crop_width: (p.crop_width as number | undefined),
          crop_height: (p.crop_height as number | undefined),
        }; })()}
        tradeable={tradeable}
        visible={visible}
        onClose={onClose}
      />
    );
  }
  return <CollectSheet {...props} />;
}
