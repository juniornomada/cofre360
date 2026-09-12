create table if not exists public.ai_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_chat_conversations_user_updated_idx
  on public.ai_chat_conversations (user_id, updated_at desc);

alter table public.ai_chat_conversations enable row level security;

create policy "Users can view own AI chat conversations"
  on public.ai_chat_conversations for select
  using (auth.uid() = user_id);

create policy "Users can create own AI chat conversations"
  on public.ai_chat_conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own AI chat conversations"
  on public.ai_chat_conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own AI chat conversations"
  on public.ai_chat_conversations for delete
  using (auth.uid() = user_id);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_messages_conversation_created_idx
  on public.ai_chat_messages (conversation_id, created_at asc);

alter table public.ai_chat_messages enable row level security;

create policy "Users can view messages from own AI chats"
  on public.ai_chat_messages for select
  using (exists (
    select 1 from public.ai_chat_conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  ));

create policy "Users can create messages in own AI chats"
  on public.ai_chat_messages for insert
  with check (exists (
    select 1 from public.ai_chat_conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  ));

create policy "Users can delete messages from own AI chats"
  on public.ai_chat_messages for delete
  using (exists (
    select 1 from public.ai_chat_conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  ));

grant select, insert, update, delete on public.ai_chat_conversations to authenticated;
grant select, insert, delete on public.ai_chat_messages to authenticated;
