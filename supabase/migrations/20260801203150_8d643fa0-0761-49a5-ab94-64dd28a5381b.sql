CREATE TABLE public.polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL UNIQUE REFERENCES public.posts(id) ON DELETE CASCADE,
  duration interval,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  content text NOT NULL,
  position smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, position)
);

CREATE TABLE public.poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id)
);

CREATE INDEX idx_poll_options_poll ON public.poll_options(poll_id);
CREATE INDEX idx_poll_votes_poll ON public.poll_votes(poll_id);
CREATE INDEX idx_poll_votes_option ON public.poll_votes(option_id);

GRANT SELECT ON public.polls TO anon;
GRANT SELECT, INSERT, DELETE ON public.polls TO authenticated;
GRANT ALL ON public.polls TO service_role;

GRANT SELECT ON public.poll_options TO anon;
GRANT SELECT, INSERT, DELETE ON public.poll_options TO authenticated;
GRANT ALL ON public.poll_options TO service_role;

GRANT SELECT ON public.poll_votes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poll_votes TO authenticated;
GRANT ALL ON public.poll_votes TO service_role;

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_poll_open(_poll_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = _poll_id
      AND (p.duration IS NULL OR now() < p.created_at + p.duration)
  );
$$;

REVOKE ALL ON FUNCTION public.is_poll_open(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_poll_open(uuid) TO authenticated, service_role;

CREATE POLICY "Polls are publicly readable" ON public.polls
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Post authors can create polls" ON public.polls
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts po WHERE po.id = post_id AND po.author_id = auth.uid()));
CREATE POLICY "Post authors can delete polls" ON public.polls
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts po WHERE po.id = post_id AND po.author_id = auth.uid()));

CREATE POLICY "Poll options are publicly readable" ON public.poll_options
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Poll authors can create options" ON public.poll_options
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.polls p
    JOIN public.posts po ON po.id = p.post_id
    WHERE p.id = poll_id AND po.author_id = auth.uid()
  ));
CREATE POLICY "Poll authors can delete options" ON public.poll_options
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.polls p
    JOIN public.posts po ON po.id = p.post_id
    WHERE p.id = poll_id AND po.author_id = auth.uid()
  ));

CREATE POLICY "Poll votes are publicly readable" ON public.poll_votes
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users can cast their own vote" ON public.poll_votes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_poll_open(poll_id));
CREATE POLICY "Users can change their own vote" ON public.poll_votes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.is_poll_open(poll_id))
  WITH CHECK (auth.uid() = user_id AND public.is_poll_open(poll_id));
CREATE POLICY "Users can remove their own vote" ON public.poll_votes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND public.is_poll_open(poll_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;