-- Seed idempotente: garante que a categoria "Pagamento de Cartão" e suas
-- subcategorias existam em qualquer ambiente (dev, staging, produção, restore).
-- Espelha o grupo definido em src/lib/categories.ts (ícone 💳).
-- Reexecutável: NOT EXISTS por label evita duplicatas.

DO $$
DECLARE
  v_category_id text;
BEGIN
  -- 1) Categoria raiz
  SELECT id INTO v_category_id
  FROM public.categories
  WHERE label = 'Pagamento de Cartão'
  LIMIT 1;

  IF v_category_id IS NULL THEN
    v_category_id := gen_random_uuid()::text;
    INSERT INTO public.categories (id, label, icon, sort_order)
    VALUES (
      v_category_id,
      'Pagamento de Cartão',
      '💳',
      -- Slot intermediário estável entre "Dívidas/Parcelas" (12) e
      -- "Transferências" (13), sem precisar deslocar as demais.
      125
    );
  ELSE
    -- Garante ícone canônico caso alguém tenha alterado manualmente.
    UPDATE public.categories
       SET icon = '💳',
           updated_at = now()
     WHERE id = v_category_id
       AND icon IS DISTINCT FROM '💳';
  END IF;

  -- 2) Subcategorias — Pagamento Total, Pagamento Parcial, Outros
  INSERT INTO public.subcategories (id, category_id, label, icon, sort_order)
  SELECT gen_random_uuid()::text, v_category_id, sub.label, '💳', sub.sort_order
  FROM (VALUES
    ('Pagamento Total',   1::bigint),
    ('Pagamento Parcial', 2::bigint),
    ('Outros',            3::bigint)
  ) AS sub(label, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.subcategories s
    WHERE s.category_id = v_category_id
      AND s.label = sub.label
  );
END $$;