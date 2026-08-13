ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;