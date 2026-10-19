-- Converter datas do formato 'DD MMM' para 'YYYY-MM-DD'
UPDATE reminders
SET due_date = 
  CASE 
    WHEN due_date LIKE '% jan' THEN '2026-01-' || LPAD(SPLIT_PART(due_date, ' ', 1), 2, '0')
    WHEN due_date LIKE '% fev' THEN '2026-02-' || LPAD(SPLIT_PART(due_date, ' ', 1), 2, '0')
    WHEN due_date LIKE '% mar' THEN '2026-03-' || LPAD(SPLIT_PART(due_date, ' ', 1), 2, '0')
    WHEN due_date LIKE '% abr' THEN '2026-04-' || LPAD(SPLIT_PART(due_date, ' ', 1), 2, '0')
    WHEN due_date LIKE '% mai' THEN '2026-05-' || LPAD(SPLIT_PART(due_date, ' ', 1), 2, '0')
    WHEN due_date LIKE '% jun' THEN '2026-06-' || LPAD(SPLIT_PART(due_date, ' ', 1), 2, '0')
    WHEN due_date LIKE '% jul' THEN '2026-07-' || LPAD(SPLIT_PART(due_date, ' ', 1), 2, '0')
    WHEN due_date LIKE '% ago' THEN '2026-08-' || LPAD(SPLIT_PART(due_date, ' ', 1), 2, '0')
    WHEN due_date LIKE '% set' THEN '2026-09-' || LPAD(SPLIT_PART(due_date, ' ', 1), 2, '0')
    WHEN due_date LIKE '% out' THEN '2026-10-' || LPAD(SPLIT_PART(due_date, ' ', 1), 2, '0')
    WHEN due_date LIKE '% nov' THEN '2026-11-' || LPAD(SPLIT_PART(due_date, ' ', 1), 2, '0')
    WHEN due_date LIKE '% dez' THEN '2026-12-' || LPAD(SPLIT_PART(due_date, ' ', 1), 2, '0')
    ELSE due_date
  END
WHERE due_date NOT LIKE '202%';

-- Mesma coisa para completion_date
UPDATE reminders
SET completion_date = 
  CASE 
    WHEN completion_date LIKE '% jan' THEN '2026-01-' || LPAD(SPLIT_PART(completion_date, ' ', 1), 2, '0')
    WHEN completion_date LIKE '% fev' THEN '2026-02-' || LPAD(SPLIT_PART(completion_date, ' ', 1), 2, '0')
    WHEN completion_date LIKE '% mar' THEN '2026-03-' || LPAD(SPLIT_PART(completion_date, ' ', 1), 2, '0')
    WHEN completion_date LIKE '% abr' THEN '2026-04-' || LPAD(SPLIT_PART(completion_date, ' ', 1), 2, '0')
    WHEN completion_date LIKE '% mai' THEN '2026-05-' || LPAD(SPLIT_PART(completion_date, ' ', 1), 2, '0')
    WHEN completion_date LIKE '% jun' THEN '2026-06-' || LPAD(SPLIT_PART(completion_date, ' ', 1), 2, '0')
    WHEN completion_date LIKE '% jul' THEN '2026-07-' || LPAD(SPLIT_PART(completion_date, ' ', 1), 2, '0')
    WHEN completion_date LIKE '% ago' THEN '2026-08-' || LPAD(SPLIT_PART(completion_date, ' ', 1), 2, '0')
    WHEN completion_date LIKE '% set' THEN '2026-09-' || LPAD(SPLIT_PART(completion_date, ' ', 1), 2, '0')
    WHEN completion_date LIKE '% out' THEN '2026-10-' || LPAD(SPLIT_PART(completion_date, ' ', 1), 2, '0')
    WHEN completion_date LIKE '% nov' THEN '2026-11-' || LPAD(SPLIT_PART(completion_date, ' ', 1), 2, '0')
    WHEN completion_date LIKE '% dez' THEN '2026-12-' || LPAD(SPLIT_PART(completion_date, ' ', 1), 2, '0')
    ELSE completion_date
  END
WHERE completion_date NOT LIKE '202%';
