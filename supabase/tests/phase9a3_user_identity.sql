begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('93000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'identity-a@example.test', ''),
  ('93000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'identity-b@example.test', '');

do $$
begin
  if not exists (select 1 from pg_class where oid = 'public.profiles'::regclass and relrowsecurity and relforcerowsecurity) then
    raise exception 'profiles must keep FORCE RLS';
  end if;
  begin
    update public.profiles set first_name = 'Only first' where id = '93000000-0000-4000-8000-000000000001';
    raise exception 'partial identity accepted';
  exception when check_violation then null; end;
  begin
    update public.profiles set first_name = ' Ana  ', last_name = 'Pérez' where id = '93000000-0000-4000-8000-000000000001';
    raise exception 'unnormalized identity accepted';
  exception when check_violation then null; end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);
update public.profiles set first_name = 'Ana', last_name = 'Pérez López'
where id = '93000000-0000-4000-8000-000000000001';
do $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and first_name = 'Ana' and last_name = 'Pérez López'
  ) then raise exception 'owner cannot save identity'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000002', true);
update public.profiles set first_name = 'Edited', last_name = 'By Other User'
where id = '93000000-0000-4000-8000-000000000001';
do $$
begin
  if exists (select 1 from public.profiles where id = '93000000-0000-4000-8000-000000000001') then
    raise exception 'user B can read user A identity';
  end if;
end;
$$;

reset role;
do $$
begin
  if not exists (
    select 1 from public.profiles
    where id = '93000000-0000-4000-8000-000000000001' and first_name = 'Ana' and last_name = 'Pérez López'
  ) then raise exception 'user B modified user A identity'; end if;
end;
$$;

rollback;
