-- Store the auth email on the public profile snapshot.
-- Auth remains the source of truth; this copies the signup email for app queries.

ALTER TABLE public.profiles
  ADD COLUMN email TEXT;

UPDATE public.profiles AS profiles
SET email = users.email
FROM auth.users AS users
WHERE users.id = profiles.id
  AND profiles.email IS DISTINCT FROM users.email;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;
