-- Deletando o usuário da tabela de autenticação do Supabase. 
-- Como as tabelas públicas usam ON DELETE CASCADE ou o usuário não possui mais dados nelas (já transferidos), 
-- a remoção do auth.users é o passo final.

DELETE FROM auth.users WHERE email = 'teste@teste.com.br';