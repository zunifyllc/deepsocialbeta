CREATE OR REPLACE FUNCTION public.increment_like_count(post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.posts SET like_count = like_count + 1 WHERE id = post_id;
$$;

CREATE OR REPLACE FUNCTION public.decrement_like_count(post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.posts SET like_count = greatest(like_count - 1, 0) WHERE id = post_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_reply_count(post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.posts SET reply_count = reply_count + 1 WHERE id = post_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_like_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_like_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_reply_count(uuid) TO authenticated;
