CREATE TABLE public.bookmark_collections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookmark_collections TO authenticated;
GRANT ALL ON public.bookmark_collections TO service_role;

ALTER TABLE public.bookmark_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own collections" ON public.bookmark_collections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own collections" ON public.bookmark_collections
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own collections" ON public.bookmark_collections
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own collections" ON public.bookmark_collections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_bookmark_collections_updated_at
  BEFORE UPDATE ON public.bookmark_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.bookmarks
  ADD COLUMN collection_id uuid REFERENCES public.bookmark_collections(id) ON DELETE SET NULL;

CREATE INDEX idx_bookmarks_collection ON public.bookmarks(collection_id);