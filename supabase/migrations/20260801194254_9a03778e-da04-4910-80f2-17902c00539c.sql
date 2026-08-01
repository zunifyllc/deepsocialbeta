-- Tighten notification insert policy so only the actor can create notifications about themselves
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

CREATE POLICY "Users can create notifications as actor"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = actor_id);

-- Restrict execute on trigger-only SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;

-- get_follow_counts is a read-only helper; make it SECURITY INVOKER so RLS applies naturally
CREATE OR REPLACE FUNCTION public.get_follow_counts(user_uuid uuid)
RETURNS TABLE(following_count bigint, followers_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.follows WHERE follower_id = user_uuid),
    (SELECT count(*) FROM public.follows WHERE following_id = user_uuid);
$$;

GRANT EXECUTE ON FUNCTION public.get_follow_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_follow_counts(uuid) TO anon;
