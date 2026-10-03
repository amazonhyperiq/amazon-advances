create extension if not exists pgcrypto;

create table if not exists public.advance_giver_recovery_codes (
  giver_id uuid primary key references public.advance_givers(id) on delete cascade,
  code_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.advance_giver_recovery_codes enable row level security;
revoke all on public.advance_giver_recovery_codes from public, anon, authenticated;

create or replace function public.advance_giver_change_password(
  p_giver_id uuid, p_old_password text, p_new_password text
) returns void language plpgsql security definer set search_path=public as $$
declare password_column text;
begin
  if coalesce(length(p_new_password),0)<6 then raise exception 'كلمة المرور يجب أن تكون 6 أحرف أو أكثر'; end if;
  perform * from public.advance_giver_login(p_giver_id=>p_giver_id,p_password=>p_old_password);
  select c.column_name into password_column from information_schema.columns c
  where c.table_schema='public' and c.table_name='advance_givers'
    and lower(c.column_name) in ('password_hash','passwordhash','password_digest','password_hash_value','password')
    and c.data_type in ('text','character varying','character')
  order by case lower(c.column_name) when 'password_hash' then 1 when 'passwordhash' then 2 when 'password_digest' then 3 when 'password_hash_value' then 4 when 'password' then 5 else 99 end limit 1;
  if password_column is null then raise exception 'لم يتم العثور على حقل كلمة المرور في جدول advance_givers'; end if;
  execute format('update public.advance_givers set %I=crypt($1,gen_salt(''bf'')) where id=$2',password_column) using p_new_password,p_giver_id;
  if not found then raise exception 'الحساب غير موجود'; end if;
end $$;

create or replace function public.advance_giver_set_recovery_code(
  p_giver_id uuid, p_old_password text, p_recovery_code text
) returns void language plpgsql security definer set search_path=public as $$
begin
  if coalesce(length(p_recovery_code),0)<4 then raise exception 'رمز الاستعادة يجب أن يكون 4 أحرف/أرقام على الأقل'; end if;
  perform * from public.advance_giver_login(p_giver_id=>p_giver_id,p_password=>p_old_password);
  insert into public.advance_giver_recovery_codes(giver_id,code_hash,updated_at)
  values(p_giver_id,crypt(p_recovery_code,gen_salt(''bf'')),now())
  on conflict(giver_id) do update set code_hash=excluded.code_hash,updated_at=now();
end $$;

create or replace function public.advance_giver_reset_password(
  p_giver_id uuid, p_recovery_code text, p_new_password text
) returns void language plpgsql security definer set search_path=public as $$
declare password_column text; saved_hash text;
begin
  if coalesce(length(p_new_password),0)<6 then raise exception 'كلمة المرور يجب أن تكون 6 أحرف أو أكثر'; end if;
  select code_hash into saved_hash from public.advance_giver_recovery_codes where giver_id=p_giver_id;
  if saved_hash is null or crypt(p_recovery_code,saved_hash)<>saved_hash then raise exception 'رمز الاستعادة غير صحيح'; end if;
  select c.column_name into password_column from information_schema.columns c
  where c.table_schema='public' and c.table_name='advance_givers'
    and lower(c.column_name) in ('password_hash','passwordhash','password_digest','password_hash_value','password')
    and c.data_type in ('text','character varying','character')
  order by case lower(c.column_name) when 'password_hash' then 1 when 'passwordhash' then 2 when 'password_digest' then 3 when 'password_hash_value' then 4 when 'password' then 5 else 99 end limit 1;
  if password_column is null then raise exception 'لم يتم العثور على حقل كلمة المرور في جدول advance_givers'; end if;
  execute format('update public.advance_givers set %I=crypt($1,gen_salt(''bf'')) where id=$2',password_column) using p_new_password,p_giver_id;
  if not found then raise exception 'الحساب غير موجود'; end if;
end $$;

revoke all on function public.advance_giver_change_password(uuid,text,text) from public;
revoke all on function public.advance_giver_set_recovery_code(uuid,text,text) from public;
revoke all on function public.advance_giver_reset_password(uuid,text,text) from public;
grant execute on function public.advance_giver_change_password(uuid,text,text) to anon, authenticated;
grant execute on function public.advance_giver_set_recovery_code(uuid,text,text) to anon, authenticated;
grant execute on function public.advance_giver_reset_password(uuid,text,text) to anon, authenticated;
