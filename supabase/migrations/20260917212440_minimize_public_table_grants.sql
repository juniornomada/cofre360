-- Defense in depth: minimize Data API grants in addition to RLS.
-- Anonymous clients should not have write/DDL-adjacent privileges on user financial data.

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

revoke all privileges on table public.ai_chat_conversations from anon;
revoke all privileges on table public.ai_chat_messages from anon;
revoke all privileges on table public.ai_test_runs from anon;
revoke all privileges on table public.bank_accounts from anon;
revoke all privileges on table public.budget_categories from anon;
revoke all privileges on table public.card_payments from anon;
revoke all privileges on table public.card_refunds from anon;
revoke all privileges on table public.cards from anon;
revoke all privileges on table public.goals from anon;
revoke all privileges on table public.investments from anon;
revoke all privileges on table public.profiles from anon;
revoke all privileges on table public.reconciliation_divergences from anon;
revoke all privileges on table public.reconciliation_rules from anon;
revoke all privileges on table public.reconciliation_runs from anon;
revoke all privileges on table public.reminders from anon;
revoke all privileges on table public.transaction_templates from anon;
revoke all privileges on table public.transactions from anon;

revoke all privileges on table public.categories from anon;
revoke all privileges on table public.subcategories from anon;
grant select on table public.categories to anon;
grant select on table public.subcategories to anon;

revoke all privileges on table public.ai_chat_conversations from authenticated;
grant select, insert, update, delete on table public.ai_chat_conversations to authenticated;
revoke all privileges on table public.ai_chat_messages from authenticated;
grant select, insert, update, delete on table public.ai_chat_messages to authenticated;
revoke all privileges on table public.bank_accounts from authenticated;
grant select, insert, update, delete on table public.bank_accounts to authenticated;
revoke all privileges on table public.budget_categories from authenticated;
grant select, insert, update, delete on table public.budget_categories to authenticated;
revoke all privileges on table public.card_payments from authenticated;
grant select, insert, update, delete on table public.card_payments to authenticated;
revoke all privileges on table public.card_refunds from authenticated;
grant select, insert, update, delete on table public.card_refunds to authenticated;
revoke all privileges on table public.cards from authenticated;
grant select, insert, update, delete on table public.cards to authenticated;
revoke all privileges on table public.goals from authenticated;
grant select, insert, update, delete on table public.goals to authenticated;
revoke all privileges on table public.investments from authenticated;
grant select, insert, update, delete on table public.investments to authenticated;
revoke all privileges on table public.profiles from authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
revoke all privileges on table public.reconciliation_divergences from authenticated;
grant select, insert, update, delete on table public.reconciliation_divergences to authenticated;
revoke all privileges on table public.reconciliation_rules from authenticated;
grant select, insert, update, delete on table public.reconciliation_rules to authenticated;
revoke all privileges on table public.reconciliation_runs from authenticated;
grant select, insert, update, delete on table public.reconciliation_runs to authenticated;
revoke all privileges on table public.reminders from authenticated;
grant select, insert, update, delete on table public.reminders to authenticated;
revoke all privileges on table public.transaction_templates from authenticated;
grant select, insert, update, delete on table public.transaction_templates to authenticated;
revoke all privileges on table public.transactions from authenticated;
grant select, insert, update, delete on table public.transactions to authenticated;

revoke all privileges on table public.categories from authenticated;
grant select, insert, update, delete on table public.categories to authenticated;
revoke all privileges on table public.subcategories from authenticated;
grant select, insert, update, delete on table public.subcategories to authenticated;

revoke all privileges on table public.ai_test_runs from authenticated;

alter default privileges in schema public revoke all on tables from anon;
