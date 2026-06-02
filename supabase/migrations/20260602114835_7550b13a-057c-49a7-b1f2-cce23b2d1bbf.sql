-- 1. Gerar IDs para quaisquer linhas que tenham ID nulo
UPDATE public.budget_categories SET id = gen_random_uuid()::text WHERE id IS NULL;

-- 2. Garantir que a coluna id não aceite valores nulos
ALTER TABLE public.budget_categories ALTER COLUMN id SET NOT NULL;

-- 3. Definir a coluna id como chave primária (Primary Key), caso ainda não seja
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'budget_categories' AND constraint_type = 'PRIMARY KEY'
    ) THEN
        ALTER TABLE public.budget_categories ADD PRIMARY KEY (id);
    END IF;
END $$;

-- 4. Definir valor padrão para novos IDs
ALTER TABLE public.budget_categories ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- 5. Restaurar os tipos de dados para numeric para permitir centavos corretamente
ALTER TABLE public.budget_categories ALTER COLUMN spent TYPE numeric USING spent::numeric;
ALTER TABLE public.budget_categories ALTER COLUMN budget_limit TYPE numeric USING budget_limit::numeric;

-- 6. Garantir que as colunas de data tenham valores padrão
ALTER TABLE public.budget_categories ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.budget_categories ALTER COLUMN updated_at SET DEFAULT now();

-- 7. Aproveitar para corrigir o valor do Transporte conforme solicitado pelo usuário (caso ainda esteja em 1000)
UPDATE public.budget_categories SET budget_limit = 1300 WHERE category = 'Transporte' AND budget_limit = 1000;
