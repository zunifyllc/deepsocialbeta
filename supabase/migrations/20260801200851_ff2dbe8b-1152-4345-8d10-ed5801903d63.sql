CREATE TABLE public.reposts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  quote_content text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

ALTER TABLE public.reposts ADD CONSTRAINT reposts_user_id_profiles_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX reposts_post_id_idx ON public.reposts(post_id);
CREATE INDEX reposts_user_id_created_at_idx ON public.reposts(user_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.reposts TO authenticated;
GRANT SELECT ON public.reposts TO anon;
GRANT ALL ON public.reposts TO service_role;

ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reposts are publicly readable" ON public.reposts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users can create their own reposts" ON public.reposts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reposts" ON public.reposts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.sync_repost_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET repost_count = repost_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSE
    UPDATE public.posts SET repost_count = greatest(repost_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_repost_count() FROM anon, authenticated, public;

CREATE TRIGGER reposts_sync_count
AFTER INSERT OR DELETE ON public.reposts
FOR EACH ROW EXECUTE FUNCTION public.sync_repost_count();