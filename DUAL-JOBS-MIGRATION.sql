-- دعم راتبين/وظيفتين مستقلتين للموظف مع الحفاظ على السجلات القديمة.
-- شغّل هذا الملف مرة واحدة فقط في Supabase SQL Editor.

alter table public.employee_salaries
  add column if not exists second_currency text not null default 'IQD',
  add column if not exists second_nominal_salary numeric(14,2) not null default 0,
  add column if not exists second_official_hours numeric(6,2) not null default 8,
  add column if not exists second_work_hours numeric(8,2) not null default 0,
  add column if not exists second_overtime_daily_hours numeric(6,2) not null default 0,
  add column if not exists second_overtime_hours numeric(8,2) not null default 0;

-- ترحيل نموذج العمل الثاني القديم: قيمة يومية × 30 = راتب شهري.
update public.employee_salaries
set second_currency = 'IQD',
    second_nominal_salary = case
      when coalesce(second_nominal_salary,0)=0 and second_job_enabled=true
        then coalesce(second_job_daily_value,0) * 30
      else coalesce(second_nominal_salary,0)
    end
where second_job_enabled=true;

-- كل السجلات القديمة تعتبر للوظيفة الرئيسية حتى لا تتغير حساباتها.
alter table public.employee_salaries drop constraint if exists employee_salaries_second_currency_check;
alter table public.employee_salaries add constraint employee_salaries_second_currency_check
  check (second_currency in ('IQD','USD'));

alter table public.employee_salaries drop constraint if exists employee_salaries_dual_values_nonnegative;
alter table public.employee_salaries add constraint employee_salaries_dual_values_nonnegative
  check (second_nominal_salary >= 0 and second_official_hours > 0 and second_work_hours >= 0
         and second_overtime_daily_hours >= 0 and second_overtime_hours >= 0);

-- تحديد الوظيفة المرتبطة بالإجازة. القديم = الرئيسي.
alter table public.advance_leaves add column if not exists job_slot text not null default 'primary';
update public.advance_leaves set job_slot='primary' where job_slot is null or job_slot not in ('primary','second');
alter table public.advance_leaves drop constraint if exists advance_leaves_job_slot_check;
alter table public.advance_leaves add constraint advance_leaves_job_slot_check check (job_slot in ('primary','second'));
create index if not exists advance_leaves_employee_job_idx on public.advance_leaves(employee_id, job_slot);

-- تحديد الوظيفة المرتبطة بالعقوبة. القديم = الرئيسي.
alter table public.employee_penalties add column if not exists job_slot text not null default 'primary';
update public.employee_penalties set job_slot='primary' where job_slot is null or job_slot not in ('primary','second');
alter table public.employee_penalties drop constraint if exists employee_penalties_job_slot_check;
alter table public.employee_penalties add constraint employee_penalties_job_slot_check check (job_slot in ('primary','second'));
create index if not exists employee_penalties_employee_job_idx on public.employee_penalties(employee_id, job_slot);

notify pgrst, 'reload schema';
