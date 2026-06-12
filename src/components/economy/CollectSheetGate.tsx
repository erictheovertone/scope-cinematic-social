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

type CollectSheetProps = React.ComponentProps<typeof CollectSheet>;

export default function CollectSheetGate(props: CollectSheetProps) {
  // Market sheet (v2) shows for real COIN posts (production legacy gate), OR
  // under the dev preview flag on mock data (skeleton testing). Legacy 1155
  // posts in production (flag off, no coin_address) fall through to the existing
  // collectible sheet — no market UI, per §9.
  if (economyPreviewEnabled() || isCoinPost(props.post as { coin_address?: string | null; token_standard?: string | null })) {
    const { post, visible, onClose } = props;
    return (
      <CollectSheetV2
        post={{ id: post.id, username: post.username, caption: post.caption, media_urls: post.media_urls, ticker: (post as { ticker?: string | null }).ticker ?? null }}
        visible={visible}
        onClose={onClose}
      />
    );
  }
  return <CollectSheet {...props} />;
}
