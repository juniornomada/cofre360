INSERT INTO transactions (id, name, amount, category, icon, type, date, bank_account_id)
VALUES (
  gen_random_uuid(),
  'Despesa em Moradia',
  500.00,
  'Moradia',
  '🏠',
  'expense',
  to_char(now(), 'DD Mon'),
  'c8a5fc8d-3d8f-4813-ac90-868e2a1682c6'
);