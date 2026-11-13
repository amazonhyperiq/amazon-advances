-- Amazon Advances: self-service giver password change
-- Run once in Supabase SQL Editor. Does not modify existing giver or advance records.
create extension if not exists pgcrypto;

create or replace function public.advance_giver_change_password(
  p_giver_id uuid,
  p_old_password text,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text;
  v_password_column text;
begin
  if p_giver_id is null or coalesce(length(p_old_password),0)=0 then
    raise exception 'أدخل كلمة المرور الحالية';
  end if;

  if p_new_password is null
     or not (p_new_password ~ '^([0-9]{6,}|(?=.*[A-Za-z])[A-Za-z0-9]{6,})$') then
    raise exception 'كلمة المرور يجب أن تكون 6 خانات أو أكثر، أرقام فقط أو حروف وأرقام بدون رموز';
  end if;

  select c.column_name
    into v_password_column
  from information_schema.columns c
  where c.table_schema='public'
    and c.table_name='advance_giver_accounts'
    and lower(c.column_name) in (
      'password_hash','passwordhash','password_digest',
      'password_hash_value','password'
    )
    and c.data_type in ('text','character varying','character')
  order by case lower(c.column_name)
    when 'password_hash' then 1
    when 'passwordhash' then 2
    when 'password_digest' then 3
    when 'password_hash_value' then 4
    when 'password' then 5
    else 99 end
  limit 1;

  if v_password_column is null then
    raise exception 'لم يتم العثور على حقل كلمة المرور في advance_giver_accounts؛ أرسل نتيجة ملف التشخيص';
  end if;

  execute format(
    'select %I from public.advance_giver_accounts
     where giver_id = $1 and coalesce(is_active,true)=true
       and password_set_at is not null',
    v_password_column
  )
  into v_hash
  using p_giver_id;

  if v_hash is null then
    raise exception 'حساب المانح غير فعال أو لم يتم إعداد كلمة المرور';
  end if;

  if crypt(p_old_password, v_hash) <> v_hash then
    raise exception 'كلمة المرور الحالية غير صحيحة';
  end if;

  execute format(
    'update public.advance_giver_accounts
       set %I = crypt($1, gen_salt(''bf'')),
           password_set_at = coalesce(password_set_at, now())
     where giver_id = $2 and coalesce(is_active,true)=true',
    v_password_column
  )
  using p_new_password, p_giver_id;
end;
$$;

revoke all on function public.advance_giver_change_password(uuid,text,text) from public;
grant execute on function public.advance_giver_change_password(uuid,text,text) to anon, authenticated;

notify pgrst, 'reload schema';
