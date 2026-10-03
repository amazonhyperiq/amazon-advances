-- النسخة النهائية: إلغاء نظام Recovery Code بالكامل
-- وتشغيل تغيير كلمة المرور فقط عند معرفة كلمة المرور الحالية.

create extension if not exists pgcrypto;

-- حذف نظام الاسترجاع القديم بالكامل.
drop function if exists public.advance_giver_reset_password(uuid,text,text);
drop function if exists public.advance_giver_set_recovery_code(uuid,text,text);
drop table if exists public.advance_giver_recovery_codes cascade;

-- تغيير كلمة المرور: يتطلب كلمة المرور الحالية.
create or replace function public.advance_giver_change_password(
  p_giver_id uuid,
  p_old_password text,
  p_new_password text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  password_column text;
begin
  if coalesce(length(p_new_password),0) < 6 then
    raise exception 'كلمة المرور يجب أن تكون 6 أحرف أو أكثر';
  end if;

  -- لا يسمح بالتغيير إلا بعد التحقق من كلمة المرور الحالية.
  perform * from public.advance_giver_login(
    p_giver_id=>p_giver_id,
    p_password=>p_old_password
  );

  select c.column_name into password_column
  from information_schema.columns c
  where c.table_schema='public'
    and c.table_name='advance_givers'
    and lower(c.column_name) in (
      'password_hash',
      'passwordhash',
      'password_digest',
      'password_hash_value',
      'password'
    )
    and c.data_type in ('text','character varying','character')
  order by case lower(c.column_name)
    when 'password_hash' then 1
    when 'passwordhash' then 2
    when 'password_digest' then 3
    when 'password_hash_value' then 4
    when 'password' then 5
    else 99
  end
  limit 1;

  if password_column is null then
    raise exception 'لم يتم العثور على حقل كلمة المرور في جدول advance_givers';
  end if;

  execute format(
    'update public.advance_givers set %I=crypt($1,gen_salt(''bf'')) where id=$2',
    password_column
  )
  using p_new_password,p_giver_id;

  if not found then
    raise exception 'الحساب غير موجود';
  end if;
end;
$$;

revoke all on function public.advance_giver_change_password(uuid,text,text)
from public;

grant execute on function public.advance_giver_change_password(uuid,text,text)
to anon, authenticated;
