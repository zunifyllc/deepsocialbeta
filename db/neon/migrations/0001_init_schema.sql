-- DeepSocial — Neon PostgreSQL schema (Step 2)
--
-- Mirrors the current production schema (public schema) so the application can
-- later be pointed at Neon without changing its query shapes.
--
-- Deliberately NOT copied from the Supabase database:
--   * the `auth` and `storage` schemas (auth + file storage stay on Supabase)
--   * row level security policies and PostgREST role GRANTs (Neon is accessed
--     server-side only, through a single connection string)
--   * `handle_new_user()` (an auth.users trigger) and `get_or_create_conversation()`
--     / anything relying on `auth.uid()` — those need an explicit user argument
--     when the app runs its queries server-side.
--
-- Foreign keys that referenced `auth.users(id)` now reference
-- `public.profiles(id)`, which is the user identity anchor inside Neon.
--
-- Idempotent: safe to re-run.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
  END IF;
END $$;

-- ---------------------------------------------------------------- identity ---

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text,
  bio text DEFAULT ''::text,
  avatar_url text,
  banner_url text,
  location text,
  website text,
  is_verified boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  pinned_post_id uuid,
  pronouns text,
  accent_color text DEFAULT '#1d9bf0'::text NOT NULL,
  theme_mode text DEFAULT 'dark'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, role)
);

-- ------------------------------------------------------------------- posts ---

CREATE TABLE IF NOT EXISTS public.posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  parent_post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  media_urls text[] DEFAULT '{}'::text[],
  like_count integer DEFAULT 0 NOT NULL,
  reply_count integer DEFAULT 0 NOT NULL,
  repost_count integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  edited_at timestamptz,
  is_edited boolean DEFAULT false NOT NULL,
  status text DEFAULT 'published'::text NOT NULL,
  scheduled_at timestamptz,
  CONSTRAINT posts_content_check CHECK (length(content) <= 280),
  CONSTRAINT posts_status_check CHECK (status = ANY (ARRAY['published'::text, 'scheduled'::text]))
);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_pinned_post_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pinned_post_id_fkey
  FOREIGN KEY (pinned_post_id) REFERENCES public.posts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.likes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS public.reposts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  quote_content text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS public.follows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (follower_id, following_id)
);

-- --------------------------------------------------------------- bookmarks ---

CREATE TABLE IF NOT EXISTS public.bookmark_collections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS public.bookmarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  collection_id uuid REFERENCES public.bookmark_collections(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, post_id)
);

-- ----------------------------------------------------------- notifications ---

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY['like'::text, 'reply'::text, 'follow'::text]))
);

CREATE TABLE IF NOT EXISTS public.notification_settings (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_likes boolean DEFAULT true NOT NULL,
  email_replies boolean DEFAULT true NOT NULL,
  email_follows boolean DEFAULT true NOT NULL,
  email_reposts boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- -------------------------------------------------------- direct messaging ---

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  participants uuid[] NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------- polls ---

CREATE TABLE IF NOT EXISTS public.polls (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL UNIQUE REFERENCES public.posts(id) ON DELETE CASCADE,
  duration interval,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.poll_options (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  content text NOT NULL,
  "position" smallint NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (poll_id, "position")
);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (poll_id, user_id)
);

-- ------------------------------------------------------------------- lists ---

CREATE TABLE IF NOT EXISTS public.lists (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_public boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.list_members (
  list_id uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (list_id, user_id)
);

-- --------------------------------------------------------------- analytics ---

CREATE TABLE IF NOT EXISTS public.post_impressions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.profile_visits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visited_at timestamptz DEFAULT now() NOT NULL
);

-- ------------------------------------------------------- mute up and block ---

CREATE TABLE IF NOT EXISTS public.muted_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  muted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  muted_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT muted_users_check CHECK (muted_by <> muted_user_id),
  UNIQUE (muted_by, muted_user_id)
);

CREATE TABLE IF NOT EXISTS public.blocked_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  blocked_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT blocked_users_check CHECK (blocked_by <> blocked_user_id),
  UNIQUE (blocked_by, blocked_user_id)
);

-- ----------------------------------------------------------------- indexes ---

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles USING btree (username);
CREATE INDEX IF NOT EXISTS idx_profiles_pinned_post ON public.profiles USING btree (pinned_post_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm ON public.profiles USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm ON public.profiles USING gin (display_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_posts_author_id ON public.posts USING btree (author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_parent_id ON public.posts USING btree (parent_post_id);
CREATE INDEX IF NOT EXISTS idx_posts_content_trgm ON public.posts USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON public.posts USING btree (status, scheduled_at) WHERE (status = 'scheduled'::text);

CREATE INDEX IF NOT EXISTS idx_likes_post_id ON public.likes USING btree (post_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON public.likes USING btree (user_id);

CREATE INDEX IF NOT EXISTS reposts_post_id_idx ON public.reposts USING btree (post_id);
CREATE INDEX IF NOT EXISTS reposts_user_id_created_at_idx ON public.reposts USING btree (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON public.follows USING btree (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows USING btree (following_id);

CREATE INDEX IF NOT EXISTS bookmarks_user_id_created_at_idx ON public.bookmarks USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_collection ON public.bookmarks USING btree (collection_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications USING btree (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS conversations_participants_gin ON public.conversations USING gin (participants);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_participants_key ON public.conversations USING btree (participants);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON public.messages USING btree (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON public.poll_options USING btree (poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON public.poll_votes USING btree (poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_option ON public.poll_votes USING btree (option_id);

CREATE INDEX IF NOT EXISTS idx_lists_creator ON public.lists USING btree (creator_id);
CREATE INDEX IF NOT EXISTS idx_list_members_user ON public.list_members USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_post_impressions_date ON public.post_impressions USING btree (post_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_profile_visits_date ON public.profile_visits USING btree (profile_id, visited_at);

CREATE INDEX IF NOT EXISTS idx_muted_users_muted_by ON public.muted_users USING btree (muted_by);
CREATE INDEX IF NOT EXISTS idx_muted_users_muted_user ON public.muted_users USING btree (muted_user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_by ON public.blocked_users USING btree (blocked_by);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_user ON public.blocked_users USING btree (blocked_user_id);

-- ----------------------------------------------- functions used by the app ---

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_profile_theme()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.accent_color !~* '^#[0-9a-f]{6}$' THEN
    RAISE EXCEPTION 'accent_color must be a hex color like #1d9bf0';
  END IF;
  IF NEW.theme_mode NOT IN ('dark', 'black') THEN
    RAISE EXCEPTION 'theme_mode must be dark or black';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_repost_count()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.touch_conversation_on_message()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_like_count(post_id uuid)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  UPDATE public.posts SET like_count = like_count + 1 WHERE id = post_id;
$$;

CREATE OR REPLACE FUNCTION public.decrement_like_count(post_id uuid)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  UPDATE public.posts SET like_count = greatest(like_count - 1, 0) WHERE id = post_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_reply_count(post_id uuid)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  UPDATE public.posts SET reply_count = reply_count + 1 WHERE id = post_id;
$$;

CREATE OR REPLACE FUNCTION public.get_follow_counts(user_uuid uuid)
RETURNS TABLE(following_count bigint, followers_count bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    (SELECT count(*) FROM public.follows WHERE follower_id = user_uuid),
    (SELECT count(*) FROM public.follows WHERE following_id = user_uuid);
$$;

CREATE OR REPLACE FUNCTION public.get_trending_hashtags(result_limit integer DEFAULT 10)
RETURNS TABLE(hashtag text, post_count bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conversation_id AND _user_id = ANY (c.participants)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_poll_open(_poll_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = _poll_id
      AND (p.duration IS NULL OR now() < p.created_at + p.duration)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_blocked_between(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocked_by = _a AND blocked_user_id = _b)
       OR (blocked_by = _b AND blocked_user_id = _a)
  );
$$;

CREATE OR REPLACE FUNCTION public.publish_scheduled_posts()
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.posts
  SET status = 'published'
  WHERE status = 'scheduled' AND scheduled_at <= now();
END;
$$;

-- Neon replacement for the auth.uid()-based Supabase RPC: the caller passes
-- both participants explicitly since auth lives outside this database.
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(_user_id uuid, _target_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  pair uuid[];
  convo_id uuid;
BEGIN
  IF _user_id IS NULL OR _target_user_id IS NULL OR _user_id = _target_user_id THEN
    RAISE EXCEPTION 'Invalid conversation participants';
  END IF;

  SELECT array_agg(u ORDER BY u) INTO pair
  FROM (SELECT _user_id AS u UNION SELECT _target_user_id) s;

  SELECT id INTO convo_id FROM public.conversations WHERE participants = pair;
  IF convo_id IS NULL THEN
    INSERT INTO public.conversations (participants) VALUES (pair)
    ON CONFLICT (participants) DO NOTHING
    RETURNING id INTO convo_id;
    IF convo_id IS NULL THEN
      SELECT id INTO convo_id FROM public.conversations WHERE participants = pair;
    END IF;
  END IF;

  RETURN convo_id;
END;
$$;

-- ---------------------------------------------------------------- triggers ---

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS validate_profile_theme_trigger ON public.profiles;
CREATE TRIGGER validate_profile_theme_trigger BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_profile_theme();

DROP TRIGGER IF EXISTS update_posts_updated_at ON public.posts;
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_lists_updated_at ON public.lists;
CREATE TRIGGER update_lists_updated_at BEFORE UPDATE ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_bookmark_collections_updated_at ON public.bookmark_collections;
CREATE TRIGGER update_bookmark_collections_updated_at BEFORE UPDATE ON public.bookmark_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_settings_updated_at ON public.notification_settings;
CREATE TRIGGER update_notification_settings_updated_at BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS reposts_sync_count ON public.reposts;
CREATE TRIGGER reposts_sync_count AFTER INSERT OR DELETE ON public.reposts
  FOR EACH ROW EXECUTE FUNCTION public.sync_repost_count();

DROP TRIGGER IF EXISTS messages_touch_conversation ON public.messages;
CREATE TRIGGER messages_touch_conversation AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_on_message();

COMMIT;
