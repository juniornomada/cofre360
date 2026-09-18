-- Tighten legacy RLS policy targets and administrative function search paths.

alter policy "Users can delete own AI chat conversations" on public.ai_chat_conversations to authenticated;
alter policy "Users can create own AI chat conversations" on public.ai_chat_conversations to authenticated;
alter policy "Users can view own AI chat conversations" on public.ai_chat_conversations to authenticated;
alter policy "Users can update own AI chat conversations" on public.ai_chat_conversations to authenticated;

alter policy "Users can delete messages from own AI chats" on public.ai_chat_messages to authenticated;
alter policy "Users can create messages in own AI chats" on public.ai_chat_messages to authenticated;
alter policy "Users can view messages from own AI chats" on public.ai_chat_messages to authenticated;

alter policy "card_refunds_delete_own" on public.card_refunds to authenticated;
alter policy "card_refunds_insert_own" on public.card_refunds to authenticated;
alter policy "card_refunds_select_own" on public.card_refunds to authenticated;
alter policy "card_refunds_update_own" on public.card_refunds to authenticated;

alter policy "Users can insert their own profile" on public.profiles to authenticated;
alter policy "Users can view their own profile" on public.profiles to authenticated;

alter policy "Users manage their own reconciliation_divergences" on public.reconciliation_divergences to authenticated;
alter policy "Users manage their own reconciliation_rules" on public.reconciliation_rules to authenticated;
alter policy "Users manage their own reconciliation_runs" on public.reconciliation_runs to authenticated;

alter policy "templates_delete_own" on public.transaction_templates to authenticated;
alter policy "templates_insert_own" on public.transaction_templates to authenticated;
alter policy "templates_select_own" on public.transaction_templates to authenticated;
alter policy "templates_update_own" on public.transaction_templates to authenticated;

revoke insert, update, delete on public.categories from authenticated;
revoke insert, update, delete on public.subcategories from authenticated;

alter function public.handle_new_user() set search_path = '';
alter function public.safe_transfer_user_email(text,text) set search_path = '';
