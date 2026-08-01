ALTER TABLE public.profiles
  ADD COLUMN pinned_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL;

CREATE INDEX idx_profiles_pinned_post ON public.profiles(pinned_post_id);