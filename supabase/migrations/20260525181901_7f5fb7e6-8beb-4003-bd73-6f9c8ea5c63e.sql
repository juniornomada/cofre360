UPDATE reminders 
SET is_completed = false 
WHERE is_completed IS NULL;
