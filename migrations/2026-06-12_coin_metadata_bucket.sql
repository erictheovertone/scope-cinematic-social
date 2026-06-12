-- ─────────────────────────────────────────────────────────────────────────────
-- Coin-metadata bucket — dedicated PUBLIC bucket for coin tokenURI JSON
-- (Phase 1 coin migration; option 2 ratified 2026-06-12)
--
-- RUN MANUALLY in the Supabase SQL editor. Do NOT auto-run.
-- Idempotent: ON CONFLICT / IF NOT EXISTS guards throughout.
--
-- Why dedicated: the JSON becomes the coin's PERMANENT tokenURI — it gets its
-- own bucket with application/json allowed, separate from media. The coin
-- IMAGE stays in post-media (it's the post's graded media URL; only the JSON
-- lives here).
--
-- Write path: the app uploads with the ANON key (Privy auth, no Supabase JWT),
-- mirroring how post-media accepts writes — so the policies below are
-- bucket-scoped and role-agnostic (auth.uid() is always null in our flow).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. The bucket: public, JSON-only, 1MB cap (metadata is ~1KB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'coin-metadata',
  'coin-metadata',
  true,                          -- public read: the tokenURI must be fetchable by anyone, forever
  1048576,                       -- 1MB
  ARRAY['application/json']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 1048576,
      allowed_mime_types = ARRAY['application/json'];

-- 2. Policies (storage.objects) — bucket-scoped, anon-writable like post-media.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='coin metadata publicly readable') THEN
    CREATE POLICY "coin metadata publicly readable" ON storage.objects
      FOR SELECT USING (bucket_id = 'coin-metadata');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='coin metadata insert') THEN
    CREATE POLICY "coin metadata insert" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'coin-metadata');
  END IF;

  -- Upsert on retry = UPDATE of the same object path (idempotent re-create).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='coin metadata update') THEN
    CREATE POLICY "coin metadata update" ON storage.objects
      FOR UPDATE USING (bucket_id = 'coin-metadata') WITH CHECK (bucket_id = 'coin-metadata');
  END IF;
  -- Deliberately NO delete policy: tokenURIs are permanent.
END $$;
