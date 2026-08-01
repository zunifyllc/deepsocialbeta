DROP INDEX IF EXISTS public.idx_posts_content_trgm;
DROP INDEX IF EXISTS public.idx_profiles_username_trgm;
DROP INDEX IF EXISTS public.idx_profiles_display_name_trgm;

CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

CREATE INDEX idx_posts_content_trgm ON public.posts USING gin (content extensions.gin_trgm_ops);
CREATE INDEX idx_profiles_username_trgm ON public.profiles USING gin (username extensions.gin_trgm_ops);
CREATE INDEX idx_profiles_display_name_trgm ON public.profiles USING gin (display_name extensions.gin_trgm_ops);