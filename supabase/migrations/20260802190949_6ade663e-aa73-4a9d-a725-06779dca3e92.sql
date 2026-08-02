ALTER TABLE public.profiles
  ADD COLUMN accent_color text NOT NULL DEFAULT '#1d9bf0',
  ADD COLUMN theme_mode text NOT NULL DEFAULT 'dark';

CREATE OR REPLACE FUNCTION public.validate_profile_theme()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
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

CREATE TRIGGER validate_profile_theme_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_profile_theme();