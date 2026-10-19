-- 1. Criar o usuário na tabela auth.users (necessário para o Supabase Auth)
-- Nota: O password 'bra2008' deve ser hasheado. No Supabase, geralmente usamos o endpoint de signup, 
-- mas via SQL podemos inserir diretamente se soubermos o formato (bcrypt).
-- Como não temos a função crypt habilitada por padrão ou garantida aqui sem extensões,
-- e o objetivo é que o usuário CONSIGA logar, o ideal seria usar o dashboard ou API.
-- No entanto, para persistir dados associados a UM usuário, precisamos do ID.

DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
BEGIN
  -- Tentar inserir na tabela auth.users (isso requer privilégios de superuser ou bypass via migrations seguras)
  -- Em ambientes Lovable/Supabase, inserções diretas em 'auth' via migrations são permitidas.
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    role,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    confirmation_sent_at
  )
  VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    'teste@teste.com.br',
    crypt('bra2008', gen_salt('bf')), -- Requer pgcrypto
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    'authenticated',
    '',
    '',
    '',
    now()
  );

  -- 2. Garantir que as tabelas tenham a coluna user_id e atualizar os registros órfãos
  -- Assumindo que o usuário quer que os dados ATUAIS pertençam a este novo usuário.

  -- Transações
  UPDATE public.transactions SET user_id = new_user_id WHERE user_id IS NULL;
  
  -- Contas Bancárias
  UPDATE public.bank_accounts SET user_id = new_user_id WHERE user_id IS NULL;
  
  -- Cartões
  UPDATE public.cards SET user_id = new_user_id WHERE user_id IS NULL;
  
  -- Metas
  UPDATE public.goals SET user_id = new_user_id WHERE user_id IS NULL;
  
  -- Lembretes
  UPDATE public.reminders SET user_id = new_user_id WHERE user_id IS NULL;

  -- Criar perfil se necessário
  INSERT INTO public.profiles (user_id) VALUES (new_user_id) ON CONFLICT (user_id) DO NOTHING;

END $$;
