'use client';
// ── CollectSheetGate ─────────────────────────────────────────────────────────
//
// Single switch point for the collect sheet. With the economy preview flag ON,
// renders the mock-data CollectSheetV2 (Part 2.4). With the flag OFF, renders
// the existing, real CollectSheet — so the app behaves EXACTLY as today.
// Call sites swap <CollectSheet> → <CollectSheetGate> (identical props).

import CollectSheet from '@/components/CollectSheet';
import CollectSheetV2 from '@/components/economy/CollectSheetV2';
import { economyPreviewEnabled } from '@/lib/economy/flag';
import { isCoinPost } from '@/components/EconomyProvider';
import { isUntradeableCoin } from '@/lib/economy/pairing';

type CollectSheetProps = React.ComponentProps<typeof CollectSheet>;

export default function CollectSheetGate(props: CollectSheetProps) {
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
        }; })()}
        tradeable={tradeable}
        visible={visible}
        onClose={onClose}
      />
    );
  }
  return <CollectSheet {...props} />;
}
