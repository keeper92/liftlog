-- Make username nullable and drop unique constraint
ALTER TABLE profiles ALTER COLUMN username DROP NOT NULL;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_username_key;

-- Update trigger to not require username
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
