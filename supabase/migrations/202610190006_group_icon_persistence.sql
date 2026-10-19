-- BATPAPO: persistência da imagem do grupo
-- Execute no SQL Editor do Supabase antes de testar o upload.
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS icon_path text;

NOTIFY pgrst, 'reload schema';
