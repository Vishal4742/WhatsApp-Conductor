create extension if not exists pgcrypto;

create table if not exists public.bot_users (
  chat_id text primary key,
  telegram_user_id bigint,
  username text not null default '',
  display_name text not null default '',
  mode text not null default 'shared' check (mode in ('shared', 'personal')),
  message_override text,
  current_contact_id uuid,
  personal_cursor_position integer not null default 0,
  sent_count integer not null default 0,
  skip_count integer not null default 0,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  queue_position integer not null unique,
  name text not null default '',
  phone text not null unique,
  status text not null default 'available' check (status in ('available', 'claimed', 'sent')),
  claimed_by_chat_id text references public.bot_users(chat_id) on delete set null,
  claimed_at timestamptz,
  sent_by_chat_id text references public.bot_users(chat_id) on delete set null,
  sent_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists contacts_queue_idx on public.contacts (is_active, status, queue_position);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists bot_users_set_updated_at on public.bot_users;
create trigger bot_users_set_updated_at
before update on public.bot_users
for each row
execute function public.set_updated_at();

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
before update on public.contacts
for each row
execute function public.set_updated_at();

create or replace function public.claim_next_shared_contact(p_chat_id text, p_stale_before timestamptz)
returns table (
  id uuid,
  queue_position integer,
  name text,
  phone text,
  status text,
  claimed_by_chat_id text,
  claimed_at timestamptz,
  sent_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.contacts%rowtype;
begin
  update public.contacts
  set
    status = 'available',
    claimed_by_chat_id = null,
    claimed_at = null,
    updated_at = timezone('utc', now())
  where
    status = 'claimed'
    and claimed_at is not null
    and claimed_at < p_stale_before
    and sent_at is null
    and is_active = true;

  select *
  into v_contact
  from public.contacts
  where is_active = true
    and status = 'available'
  order by queue_position asc
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

    update public.contacts
    set
      status = 'claimed',
      claimed_by_chat_id = p_chat_id,
      claimed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where id = v_contact.id
    returning * into v_contact;

  return query
  select
    v_contact.id,
    v_contact.queue_position,
    v_contact.name,
    v_contact.phone,
    v_contact.status,
    v_contact.claimed_by_chat_id,
    v_contact.claimed_at,
    v_contact.sent_at;
end;
$$;
