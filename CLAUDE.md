# Scope — Claude Code Context

## What is Scope
Scope is a cinematic social platform for visual creators. The core differentiator is a
per-user grid layout system — each user chooses how their posts display on their profile,
with support for ultra-wide (2.4:1) and cinematic (16:9) aspect ratios that Instagram
doesn't support. Posts are minted as ERC-1155 tokens on Base, making content collectible.

## Tech Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Auth**: Privy — email, Google, Farcaster, X login; auto-creates embedded wallet on Base
- **Database**: Supabase (Postgres with RLS)
- **Storage**: Supabase Storage (bucket: `post-media`, public)
- **Blockchain**: Base mainnet, ERC-1155 tokens (not yet implemented)
- **Deployment**: Vercel (target), Netlify (current config)

## Design System
- **Font**: IBM Plex Mono for all text — import via Google Fonts or local
- **Colors**: Black `#000000` backgrounds, white `#FFFFFF` text, red `#FF0000` accent only
- **Red dot**: The Scope logo is a 15x15px red circle, top-left at 10px from edges
- **Layout**: Mobile-first, target 375px wide — responsive (fixed sizing largely resolved)
- **Spacing**: Minimal. Let content breathe. No decorative borders or dividers.
- **Buttons**: Transparent background, white text, thin borders where needed
- **No rounded corners** on most UI elements — square/sharp is intentional

## File Structure
```
src/
  app/
    page.tsx                    # Home feed
    layout.tsx                  # Root layout with Privy provider
    welcome/page.tsx            # Login/signup screen
    transition/page.tsx         # Post-auth transition
    profile/
      page.tsx                  # Own profile view
      setup/page.tsx            # Onboarding — username, bio, image, grid layout
      grid-layout/page.tsx      # Change grid layout after onboarding
      [username]/page.tsx       # Public profile view
      preferences/page.tsx      # Settings hub
      account/page.tsx
      data/page.tsx             # Analytics tab
      notifications/page.tsx
      invite/page.tsx
      hidden/page.tsx
      contact/page.tsx
      terms/page.tsx
      delete-account/page.tsx
    create/page.tsx             # Post creation (redirects to CreatePostFlow)
    wallet/page.tsx             # Wallet + token holdings view
    api/
      upload/route.ts           # Upload API route
      tokens/route.ts           # Token API route
  components/
    CreatePostFlow.tsx          # Multi-step post creation modal
    GridLayouts.tsx             # Grid layout rendering component (underused)
    PostItem.tsx                # Individual post card in feed
    BottomToolbar.tsx           # Home / Create / Profile nav bar
    Lightbox.tsx                # Full-screen post viewer
    ProfileMenu.tsx             # Settings dropdown
    AnimatedContainer.tsx       # Page transition wrapper
    UserSyncProvider.tsx        # Syncs Privy user to Supabase on login
  lib/
    types.ts                    # Shared TypeScript types
    supabase/client.ts          # Supabase client (browser)
    supabase.ts                 # Legacy supabase import (use client.ts)
    userService.ts              # getUserByPrivyId, getProfile, updateProfile
    postsService.ts             # createPost, getAllPosts, getUserPosts, likes, comments
    gridLayoutService.ts        # getUserGridLayout, saveUserGridLayout
    storage.ts                  # Media upload helpers
    privy.ts                    # Privy app ID and config
    database.sql                # Schema (run in Supabase SQL editor)
    mockBlockchain.ts           # Placeholder for onchain features
    mockData.ts                 # Sample data for development
    mockStorage.ts              # Placeholder storage
```

## Database Schema (Supabase)
```sql
users         — id, privy_id, wallet_address, created_at
profiles      — id, user_id, display_name, username, bio, profile_image_url, grid_layout, created_at
posts         — id, user_id, username, caption, media_urls (text[]), layout_id, created_at
likes         — id, post_id, user_id, username, created_at
comments      — id, post_id, user_id, username, content, created_at
```
RLS is enabled on all tables. Users can only write their own data. All content is publicly readable.

## Grid Layout System
This is Scope's core feature. Each user picks a layout that controls how their posts
display on their profile. Layout IDs and their display rules:

| Layout ID  | Columns | Aspect Ratio       |
|------------|---------|--------------------|
| 2x-16:9    | 2       | aspect-video       |
| 2x-2.4:1   | 2       | aspect-[2.4/1]     |
| 1x-16:9    | 1       | aspect-video       |
| 1x-2.4:1   | 1       | aspect-[2.4/1]     |
| 3x-4:3     | 3       | aspect-[4/3]       |
| collage    | 2       | alternating by index: video / [2.4/1] / [4/3] / square |

Layout is saved in `profiles.grid_layout` and retrieved via `gridLayoutService.ts`.

## Known Issues (fix in this order)
1. **Auto-crop on upload** — images are not cropped to the selected layout's aspect ratio
   on upload. A photo larger or smaller than the target ratio should be center-cropped
   to fit correctly before being stored.
2. **Screening Room / discovery feed** — not yet built.

### Fixed
- ~~**Grid layout not applied**~~ — fixed. `profile/page.tsx` now reads `grid_layout`
  from Supabase and applies correct columns and aspect ratios via `getGridCols` /
  `getPostAspect`.
- ~~**Media stored as base64**~~ — fixed. `CreatePostFlow.tsx` uploads to Supabase
  Storage bucket `post-media` and stores public URLs.
- ~~**Profile setup doesn't reliably save to Supabase**~~ — fixed. Silent localStorage
  fallback removed; shows inline error and blocks navigation on failure.
- ~~**Username hardcoded**~~ — fixed. `CreatePostFlow.tsx` fetches real username from
  the user's Supabase profile before posting.
- ~~**Responsive sizing**~~ — improved. Fixed `w-[375px]` / `h-[812px]` constraints
  replaced with responsive sizing across pages.
- ~~**Public profile page not built**~~ — built. `profile/[username]/page.tsx` now
  renders a public profile with posts using the user's selected grid layout.

## Not Yet Built (do not attempt without being asked)
- Onchain minting (ERC-1155 on Base)
- Liquidity pool mechanics
- 3% transaction fee smart contract
- Collect / buy post tokens
- Trending feed filters
- Follows / followers
- Wallet balance with real token data

## Deployed
- **Production URL**: your-vercel-url.vercel.app
- Privy allowed origins must include the Vercel URL (set in the Privy dashboard under App Settings → Allowed Origins)

## Next Up
- Follows / Following system
- Notifications
- Web3 minting (ERC-1155 on Base)
- Collected page (blocked until Web3 minting is live)
- Performance optimization
- Screening Room (discovery feed)
- Settings page

## Rules for This Codebase
- **Always read files before editing them**
- **Make surgical changes** — don't refactor working code while fixing something else
- **Never use alert()** — show inline error messages in the UI
- **Never hardcode user data** — always fetch from Supabase or Privy
- **Test the auth flow** — most features require an authenticated Privy user
- **Supabase client** — always import from `@/lib/supabase/client`, not `@/lib/supabase`
- **No new dependencies** without asking first
- When adding SQL changes, output the migration SQL separately so it can be run manually
