-- Adicionar IDs para registros que estão nulos
UPDATE reminders 
SET id = gen_random_uuid()::text 
WHERE id IS NULL;

-- Tornar a coluna ID obrigatória para evitar que isso aconteça novamente
-- Nota: dependendo das constraints existentes, pode ser necessário ajustar
ALTER TABLE reminders ALTER COLUMN id SET NOT NULL;
