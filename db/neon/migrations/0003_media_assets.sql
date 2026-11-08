-- Tracks UploadThing object ownership independently of legacy Supabase storage.
-- Apply to the deepsocial database, not the separate managed Neon Auth neondb.
CREATE TABLE IF NOT EXISTS public.media_assets (
  file_key text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  public_url text NOT NULL UNIQUE,
  purpose text NOT NULL CHECK (purpose IN ('media', 'avatars', 'banners')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_owner_created
  ON public.media_assets (owner_id, created_at DESC);
