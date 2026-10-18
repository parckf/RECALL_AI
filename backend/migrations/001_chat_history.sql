-- RecallAI chat history for Supabase PostgREST.
-- Run once in the target project's Supabase SQL Editor.
-- Only the backend service role receives table access; RLS remains enabled.

begin;

create table if not exists public.chat_sessions (
  id text primary key,
  user_id text not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id text not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  text text not null,
  turn jsonb,
  created_at timestamptz not null default now(),
  constraint chat_messages_session_owner_fk
    foreign key (session_id, user_id)
    references public.chat_sessions (id, user_id)
    on delete cascade
);

create index if not exists chat_sessions_user_updated_idx
  on public.chat_sessions (user_id, updated_at desc);
create index if not exists chat_messages_session_user_created_idx
  on public.chat_messages (session_id, user_id, created_at);

alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

revoke all on table public.chat_sessions from public, anon, authenticated;
revoke all on table public.chat_messages from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.chat_sessions to service_role;
grant select, insert, update, delete on table public.chat_messages to service_role;

commit;
