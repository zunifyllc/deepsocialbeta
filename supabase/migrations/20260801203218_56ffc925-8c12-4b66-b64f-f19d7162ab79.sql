CREATE OR REPLACE FUNCTION public.is_poll_open(_poll_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = _poll_id
      AND (p.duration IS NULL OR now() < p.created_at + p.duration)
  );
$$;