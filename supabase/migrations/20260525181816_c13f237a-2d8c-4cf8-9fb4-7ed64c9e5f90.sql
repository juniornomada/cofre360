UPDATE reminders 
SET amount = 105.50, notes = 'RIC Ambiental - Valor Atualizado'
WHERE title = 'Conta de Água' AND (is_completed IS NULL OR is_completed = false);