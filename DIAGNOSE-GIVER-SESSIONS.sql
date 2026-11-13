-- تشخيص مشكلة جلسات جميع مانحي السلف
-- شغّل الاستعلام في Supabase SQL Editor ثم أرسل النتائج كاملة.
-- لا يعرض كلمات المرور أو قيم token.

-- 1) أعمدة حسابات المانحين والجلسات
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
  and table_name in ('advance_giver_accounts','advance_giver_sessions')
order by table_name, ordinal_position;

-- 2) تعريف دالة تسجيل الدخول (الجزء الحاسم: إنشاء سجل الجلسة)
select pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='advance_giver_login';

-- 3) تعريف دالة إضافة السلفة للمانح
select pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='create_advance_for_giver';

-- 4) عدد الجلسات الصالحة لكل مانح (لا يعرض token أو hash)
select g.id, g.name, g.is_active as giver_active,
       a.is_active as account_active,
       (a.password_set_at is not null) as password_is_set,
       count(s.*) filter (where s.expires_at > now()) as valid_sessions
from public.advance_givers g
left join public.advance_giver_accounts a on a.giver_id=g.id
left join public.advance_giver_sessions s on s.account_id = a.id
group by g.id,g.name,g.is_active,a.is_active,a.password_set_at
order by g.name;
