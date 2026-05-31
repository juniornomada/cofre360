-- Definindo os IDs dos usuários baseados na consulta anterior
DO $$
DECLARE
    old_user_id UUID := '0d6b8b86-fb23-4fab-b8c1-45befc441875'; -- teste@teste.com.br
    new_user_id UUID := 'c5c2adec-caad-4b80-9060-6923e245ed36'; -- wojr@live.com
BEGIN
    -- Atualizando perfis (se o novo usuário já tiver perfil, deletamos o antigo ou mesclamos)
    -- Para simplificar e garantir a integridade, vamos apenas atualizar onde não houver conflito de UNIQUE, 
    -- ou tratar caso a caso se necessário.
    
    -- Transações
    UPDATE public.transactions SET user_id = new_user_id WHERE user_id = old_user_id;
    
    -- Contas Bancárias
    UPDATE public.bank_accounts SET user_id = new_user_id WHERE user_id = old_user_id;
    
    -- Cartões
    UPDATE public.cards SET user_id = new_user_id WHERE user_id = old_user_id;
    
    -- Pagamentos de Cartão
    UPDATE public.card_payments SET user_id = new_user_id WHERE user_id = old_user_id;
    
    -- Categorias de Orçamento
    UPDATE public.budget_categories SET user_id = new_user_id WHERE user_id = old_user_id;
    
    -- Metas
    UPDATE public.goals SET user_id = new_user_id WHERE user_id = old_user_id;
    
    -- Lembretes
    UPDATE public.reminders SET user_id = new_user_id WHERE user_id = old_user_id;

    -- Perfil (Profiles costuma ter UNIQUE no user_id)
    -- Se wojr@live.com já tem um perfil, podemos querer deletar o perfil vazio dele antes de migrar o do teste
    DELETE FROM public.profiles WHERE user_id = new_user_id;
    UPDATE public.profiles SET user_id = new_user_id WHERE user_id = old_user_id;

END $$;