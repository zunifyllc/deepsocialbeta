CREATE OR REPLACE FUNCTION public.get_trending_hashtags(result_limit int DEFAULT 10)
RETURNS TABLE(hashtag text, post_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT lower(tag) AS hashtag, count(DISTINCT p.id) AS post_count
  FROM public.posts p
  CROSS JOIN LATERAL (
    SELECT DISTINCT (regexp_matches(p.content, '#([A-Za-z0-9_]{2,50})', 'g'))[1] AS tag
  ) t
  WHERE p.created_at > now() - interval '24 hours'
  GROUP BY lower(tag)
  ORDER BY post_count DESC, hashtag ASC
  LIMIT greatest(least(coalesce(result_limit, 10), 50), 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_trending_hashtags(int) TO anon, authenticated, service_role;