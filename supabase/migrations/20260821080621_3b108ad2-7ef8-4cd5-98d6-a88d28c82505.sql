ALTER TABLE public.posts
  ADD COLUMN status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','scheduled')),
  ADD COLUMN scheduled_at timestamptz;

CREATE INDEX idx_posts_scheduled ON public.posts (status, scheduled_at) WHERE status = 'scheduled';

DROP POLICY IF EXISTS "Posts are publicly readable" ON public.posts;
CREATE POLICY "Published posts are publicly readable" ON public.posts
  FOR SELECT TO anon, authenticated
  USING (status = 'published' OR auth.uid() = author_id);

CREATE OR REPLACE FUNCTION public.publish_scheduled_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.posts
  SET status = 'published'
  WHERE status = 'scheduled'
    AND scheduled_at <= now();
END;
$$;

REVOKE ALL ON FUNCTION public.publish_scheduled_posts() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule('publish-scheduled-posts', '* * * * *', 'select public.publish_scheduled_posts();');