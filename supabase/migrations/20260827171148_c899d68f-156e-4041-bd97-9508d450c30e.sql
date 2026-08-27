CREATE TABLE public.post_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_post_impressions_date ON public.post_impressions (post_id, viewed_at);

GRANT SELECT, INSERT ON public.post_impressions TO authenticated;
GRANT ALL ON public.post_impressions TO service_role;
ALTER TABLE public.post_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can record their own impressions"
  ON public.post_impressions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Post authors can read impressions"
  ON public.post_impressions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_impressions.post_id AND p.author_id = auth.uid()));

CREATE TABLE public.profile_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visited_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profile_visits_date ON public.profile_visits (profile_id, visited_at);

GRANT SELECT, INSERT ON public.profile_visits TO authenticated;
GRANT ALL ON public.profile_visits TO service_role;
ALTER TABLE public.profile_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can record their own visits"
  ON public.profile_visits FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = visitor_id);

CREATE POLICY "Profile owners can read their visits"
  ON public.profile_visits FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);