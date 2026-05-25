UPDATE reminders 
SET amount = 105.50, 
    title = TRIM(title)
WHERE title ILIKE '%Conta de Água%';
