CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participants uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX conversations_participants_key ON public.conversations (participants);
CREATE INDEX conversations_participants_gin ON public.conversations USING gin (participants);

GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read conversations" ON public.conversations
  FOR SELECT TO authenticated USING (auth.uid() = ANY (participants));
CREATE POLICY "Participants can create conversations" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = ANY (participants));
CREATE POLICY "Participants can update conversations" ON public.conversations
  FOR UPDATE TO authenticated USING (auth.uid() = ANY (participants)) WITH CHECK (auth.uid() = ANY (participants));

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_id_profiles_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX messages_conversation_created_idx ON public.messages (conversation_id, created_at);

GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conversation_id AND _user_id = ANY (c.participants)
  );
$$;

CREATE POLICY "Participants can read messages" ON public.messages
  FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Senders can send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND public.is_conversation_participant(conversation_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(target_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  pair uuid[];
  convo_id uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF target_user_id IS NULL OR target_user_id = me THEN
    RAISE EXCEPTION 'Invalid conversation target';
  END IF;

  SELECT array_agg(u ORDER BY u) INTO pair FROM (SELECT me AS u UNION SELECT target_user_id) s;

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

CREATE OR REPLACE FUNCTION public.touch_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_touch_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_on_message();

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;