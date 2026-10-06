-- إصلاح نظام إشعارات Amazon Advances
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- هذا الملف لا يلمس جداول الموظفين أو السلف أو الرواتب.

create extension if not exists pgcrypto;

create table if not exists public.advance_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  role text,
  display_name text,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.advance_push_subscriptions add column if not exists role text;
alter table public.advance_push_subscriptions add column if not exists display_name text;
alter table public.advance_push_subscriptions add column if not exists user_agent text;
alter table public.advance_push_subscriptions add column if not exists is_active boolean not null default true;
alter table public.advance_push_subscriptions add column if not exists created_at timestamptz not null default now();
alter table public.advance_push_subscriptions add column if not exists updated_at timestamptz not null default now();

create table if not exists public.advance_push_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.advance_push_events add column if not exists sent_at timestamptz;

create index if not exists advance_push_subscriptions_active_idx
  on public.advance_push_subscriptions(is_active);
create index if not exists advance_push_events_created_idx
  on public.advance_push_events(created_at desc);
create index if not exists advance_push_events_unsent_idx
  on public.advance_push_events(sent_at) where sent_at is null;

-- الاشتراك يُحفظ عبر RPC آمنة لأن الموقع يستخدم تسجيل دخول خاص بالنظام وليس Supabase Auth.
create or replace function public.save_advance_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_role text default null,
  p_display_name text default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_endpoint),'') = '' or coalesce(trim(p_p256dh),'') = '' or coalesce(trim(p_auth),'') = '' then
    raise exception 'بيانات اشتراك الإشعارات غير مكتملة';
  end if;

  insert into public.advance_push_subscriptions(endpoint,p256dh,auth,role,display_name,user_agent,is_active,updated_at)
  values(p_endpoint,p_p256dh,p_auth,p_role,p_display_name,p_user_agent,true,now())
  on conflict(endpoint) do update set
    p256dh=excluded.p256dh,
    auth=excluded.auth,
    role=excluded.role,
    display_name=excluded.display_name,
    user_agent=excluded.user_agent,
    is_active=true,
    updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.save_advance_push_subscription(text,text,text,text,text,text) from public;
grant execute on function public.save_advance_push_subscription(text,text,text,text,text,text) to anon, authenticated;

grant select, insert, update, delete on public.advance_push_subscriptions to anon, authenticated;
grant select, insert on public.advance_push_events to anon, authenticated;

-- نستخدم RLS مع سياسات محدودة للواجهة الحالية. بيانات الاشتراك ليست بيانات موظفين أو رواتب.
alter table public.advance_push_subscriptions enable row level security;
alter table public.advance_push_events enable row level security;

drop policy if exists advance_push_subscriptions_anon_insert on public.advance_push_subscriptions;
drop policy if exists advance_push_subscriptions_anon_select on public.advance_push_subscriptions;
drop policy if exists advance_push_events_anon_insert on public.advance_push_events;

-- لا نعطي الواجهة وصولًا مباشرًا لصفوف الاشتراكات؛ الحفظ يتم عبر RPC أعلاه.
create policy advance_push_subscriptions_anon_select
on public.advance_push_subscriptions for select to anon, authenticated
using (false);

create policy advance_push_subscriptions_anon_insert
on public.advance_push_subscriptions for insert to anon, authenticated
with check (false);

-- إنشاء الحدث من الموقع الحالي.
create policy advance_push_events_anon_insert
on public.advance_push_events for insert to anon, authenticated
with check (
  event_type in ('advance_added','advance_updated','advance_deleted','leave_added','leave_updated','leave_deleted','push_test')
  and length(title) between 1 and 200
  and length(body) between 1 and 1000
);

-- الوظيفة الخادمية تستخدم service_role لقراءة الأحداث والاشتراكات وتحديث sent_at.
NOTIFY pgrst, 'reload schema';
