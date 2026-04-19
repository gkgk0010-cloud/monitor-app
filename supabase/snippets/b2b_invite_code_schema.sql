-- B2B 세트 초대코드 · 학생↔세트 N:N (섹션별 순서 실행)

-- ═══════════════════════════════════════════════════════════════════════════
-- 섹션 1. word_sets 확장 (invite_code, academy_id)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.word_sets add column if not exists invite_code varchar(12);
alter table public.word_sets add column if not exists academy_id uuid;

create unique index if not exists word_sets_invite_code_key on public.word_sets (invite_code);

create index if not exists idx_word_sets_academy_id on public.word_sets (academy_id);

-- 검증용 SELECT
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'word_sets'
  and column_name in ('invite_code', 'academy_id');

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'word_sets'
  and indexname in ('word_sets_invite_code_key', 'idx_word_sets_academy_id');

-- ═══════════════════════════════════════════════════════════════════════════
-- 섹션 2. 초대코드 생성 함수 (8자, I/O/0/1 제외, 중복 방지)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.generate_invite_code()
returns varchar(12)
language plpgsql
set search_path = public
as $$
declare
  chars constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result text;
  attempt int;
  pos int;
  i int;
begin
  for attempt in 1 .. 200 loop
    result := '';
    for i in 1 .. 8 loop
      pos := 1 + floor(random() * length(chars))::int;
      if pos > length(chars) then
        pos := length(chars);
      end if;
      result := result || substr(chars, pos, 1);
    end loop;
    if not exists (
      select 1 from public.word_sets w where w.invite_code = result
    ) then
      return result;
    end if;
  end loop;
  raise exception 'generate_invite_code: could not allocate unique code';
end;
$$;

grant execute on function public.generate_invite_code() to authenticated, anon;

-- 검증용 SELECT
select proname, pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'generate_invite_code';

select public.generate_invite_code() as sample_code;

-- ═══════════════════════════════════════════════════════════════════════════
-- 섹션 3. 기존 세트 백필 (invite_code null → 생성)
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  r record;
begin
  for r in
    select id from public.word_sets where invite_code is null
  loop
    update public.word_sets
    set invite_code = public.generate_invite_code()
    where id = r.id;
  end loop;
end;
$$;

-- 검증용 SELECT
select count(*) filter (where invite_code is null) as still_null,
       count(*) as total_sets,
       count(distinct invite_code) as distinct_codes
from public.word_sets;

select id, invite_code, academy_id
from public.word_sets
order by created_at nulls last
limit 20;

-- ═══════════════════════════════════════════════════════════════════════════
-- 섹션 4. student_set_access (학생↔세트 N:N)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.student_set_access (
  id uuid primary key default gen_random_uuid(),
  student_id varchar(50) not null,
  set_id uuid not null references public.word_sets (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (student_id, set_id)
);

create index if not exists idx_student_set_access_student_id on public.student_set_access (student_id);
create index if not exists idx_student_set_access_set_id on public.student_set_access (set_id);

-- 검증용 SELECT
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'student_set_access'
order by ordinal_position;

select tc.constraint_name, tc.constraint_type
from information_schema.table_constraints tc
where tc.table_schema = 'public'
  and tc.table_name = 'student_set_access';

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'student_set_access';

-- ═══════════════════════════════════════════════════════════════════════════
-- 섹션 5. students 확장 (academy_id)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.students add column if not exists academy_id uuid;

create index if not exists idx_students_academy_id on public.students (academy_id);

-- 검증용 SELECT
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'students'
  and column_name = 'academy_id';

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'students'
  and indexname = 'idx_students_academy_id';

-- ═══════════════════════════════════════════════════════════════════════════
-- 섹션 6. RLS (초안: student_set_access SELECT/INSERT/DELETE, word_sets 초대코드 조회)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.student_set_access enable row level security;

drop policy if exists "student_set_access_select_draft" on public.student_set_access;
create policy "student_set_access_select_draft"
  on public.student_set_access for select
  to anon, authenticated
  using (true);

drop policy if exists "student_set_access_insert_draft" on public.student_set_access;
create policy "student_set_access_insert_draft"
  on public.student_set_access for insert
  to anon, authenticated
  with check (true);

drop policy if exists "student_set_access_delete_draft" on public.student_set_access;
create policy "student_set_access_delete_draft"
  on public.student_set_access for delete
  to anon, authenticated
  using (true);

drop policy if exists "word_sets_select_invite_lookup" on public.word_sets;
create policy "word_sets_select_invite_lookup"
  on public.word_sets for select
  to anon, authenticated
  using (invite_code is not null);

-- 검증용 SELECT
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('student_set_access', 'word_sets')
  and c.relkind = 'r';

select polname, polcmd, polroles::regrole[], qual::text, with_check::text
from pg_policy
where polrelid = 'public.student_set_access'::regclass
order by polname;

select polname, polcmd, qual::text
from pg_policy
where polrelid = 'public.word_sets'::regclass
  and polname = 'word_sets_select_invite_lookup';
