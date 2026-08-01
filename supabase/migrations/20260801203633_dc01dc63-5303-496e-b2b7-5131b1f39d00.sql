CREATE TABLE public.lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.list_members (
  list_id uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, user_id)
);

CREATE INDEX idx_lists_creator ON public.lists(creator_id);
CREATE INDEX idx_list_members_user ON public.list_members(user_id);

ALTER TABLE public.list_members
  ADD CONSTRAINT list_members_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT SELECT ON public.lists TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lists TO authenticated;
GRANT ALL ON public.lists TO service_role;

GRANT SELECT ON public.list_members TO anon;
GRANT SELECT, INSERT, DELETE ON public.list_members TO authenticated;
GRANT ALL ON public.list_members TO service_role;

ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public lists are readable" ON public.lists
  FOR SELECT TO anon, authenticated
  USING (is_public OR auth.uid() = creator_id);
CREATE POLICY "Users can create their own lists" ON public.lists
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Owners can update their lists" ON public.lists
  FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Owners can delete their lists" ON public.lists
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);

-- Visibility of members follows visibility of the list itself: the subquery is
-- filtered by the lists SELECT policy above.
CREATE POLICY "Members of visible lists are readable" ON public.list_members
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.lists l WHERE l.id = list_id));
CREATE POLICY "Owners can add members" ON public.list_members
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.lists l WHERE l.id = list_id AND l.creator_id = auth.uid()
  ));
CREATE POLICY "Owners can remove members" ON public.list_members
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lists l WHERE l.id = list_id AND l.creator_id = auth.uid()
  ));

CREATE TRIGGER update_lists_updated_at
  BEFORE UPDATE ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();