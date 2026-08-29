CREATE TABLE public.muted_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  muted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (muted_by, muted_user_id),
  CHECK (muted_by <> muted_user_id)
);

GRANT SELECT, INSERT, DELETE ON public.muted_users TO authenticated;
GRANT ALL ON public.muted_users TO service_role;

ALTER TABLE public.muted_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mutes" ON public.muted_users
  FOR SELECT TO authenticated USING (muted_by = auth.uid());
CREATE POLICY "Users can create their own mutes" ON public.muted_users
  FOR INSERT TO authenticated WITH CHECK (muted_by = auth.uid());
CREATE POLICY "Users can delete their own mutes" ON public.muted_users
  FOR DELETE TO authenticated USING (muted_by = auth.uid());

CREATE INDEX idx_muted_users_muted_by ON public.muted_users (muted_by);
CREATE INDEX idx_muted_users_muted_user ON public.muted_users (muted_user_id);

CREATE TABLE public.blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocked_by, blocked_user_id),
  CHECK (blocked_by <> blocked_user_id)
);

GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;
GRANT ALL ON public.blocked_users TO service_role;

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own blocks" ON public.blocked_users
  FOR SELECT TO authenticated USING (blocked_by = auth.uid());
CREATE POLICY "Users can create their own blocks" ON public.blocked_users
  FOR INSERT TO authenticated WITH CHECK (blocked_by = auth.uid());
CREATE POLICY "Users can delete their own blocks" ON public.blocked_users
  FOR DELETE TO authenticated USING (blocked_by = auth.uid());

CREATE INDEX idx_blocked_users_blocked_by ON public.blocked_users (blocked_by);
CREATE INDEX idx_blocked_users_blocked_user ON public.blocked_users (blocked_user_id);

CREATE OR REPLACE FUNCTION public.is_blocked_between(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocked_by = _a AND blocked_user_id = _b)
       OR (blocked_by = _b AND blocked_user_id = _a)
  );
$$;