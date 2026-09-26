-- Тихая Гавань: схема базы данных для общей анонимной ленты.
-- Выполнить один раз в Supabase Dashboard -> SQL Editor -> New query -> Run.

create extension if not exists pgcrypto;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('Работа','Отношения','Семья','Здоровье','Деньги','Другое')),
  text text not null check (char_length(text) between 10 and 2000),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 800),
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;
alter table public.replies enable row level security;

-- Полная анонимность: любой посетитель сайта может читать, создавать посты/ответы
-- и отмечать пост как "Стало легче" — как и описано в PRD (нет авторства, нет ролей).
drop policy if exists "posts_select_anon" on public.posts;
create policy "posts_select_anon" on public.posts for select using (true);

drop policy if exists "posts_insert_anon" on public.posts;
create policy "posts_insert_anon" on public.posts for insert with check (true);

drop policy if exists "posts_update_anon" on public.posts;
create policy "posts_update_anon" on public.posts for update using (true) with check (true);

drop policy if exists "replies_select_anon" on public.replies;
create policy "replies_select_anon" on public.replies for select using (true);

drop policy if exists "replies_insert_anon" on public.replies;
create policy "replies_insert_anon" on public.replies for insert with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.posts to anon, authenticated;
grant select, insert on public.replies to anon, authenticated;

-- Включаем realtime-трансляцию изменений, чтобы лента обновлялась у всех посетителей сразу.
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.replies;
