-- Runtime validation for Phase 4. All synthetic data is rolled back.
begin;

insert into public.companies (
  id, name, website_url
) values (
  '90000000-0000-0000-0000-000000000001',
  '  Synthetic   Systems  ',
  'https://synthetic-systems.example.invalid'
);

do $$
declare
  stored_name text;
begin
  select normalized_name into stored_name
  from public.companies
  where id = '90000000-0000-0000-0000-000000000001';

  if stored_name <> 'synthetic systems' then
    raise exception 'COMPANY_NORMALIZATION_FAILED value=%', stored_name;
  end if;

  begin
    insert into public.companies (name) values ('SYNTHETIC SYSTEMS');
    raise exception 'COMPANY_DUPLICATE_UNEXPECTED_SUCCESS';
  exception when unique_violation then
    raise notice 'PASS COMPANY_NORMALIZATION_AND_DEDUP';
  end;
end;
$$;

insert into public.job_sources (id, code, name, base_url)
values
  (
    '91000000-0000-0000-0000-000000000001',
    'SYNTHETIC_BOARD_A',
    'Synthetic Board A',
    'https://board-a.example.invalid'
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    'SYNTHETIC_BOARD_B',
    'Synthetic Board B',
    'https://board-b.example.invalid'
  );

insert into public.job_offers (
  id, company_id, title, description, location_text, country_code,
  work_mode, canonical_url, canonical_url_is_reliable
) values (
  '93000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001',
  '  Senior   Synthetic Engineer ',
  'Synthetic job description',
  'Synthetic City',
  'ES',
  'HYBRID',
  'https://careers.example.invalid/jobs/42',
  true
);

do $$
declare
  normalized text;
  hash_value text;
  has_user_id boolean;
begin
  select normalized_title, description_hash
  into normalized, hash_value
  from public.job_offers
  where id = '93000000-0000-0000-0000-000000000001';

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_offers'
      and column_name = 'user_id'
  ) into has_user_id;

  if normalized <> 'senior synthetic engineer'
     or hash_value <> encode(digest('Synthetic job description', 'sha256'), 'hex')
     or has_user_id then
    raise exception
      'NEUTRAL_OFFER_FIELDS_FAILED normalized=% hash=% has_user_id=%',
      normalized, hash_value, has_user_id;
  end if;

  begin
    insert into public.job_offers (
      title, canonical_url, canonical_url_is_reliable
    ) values (
      'Duplicate synthetic offer',
      'https://careers.example.invalid/jobs/42',
      true
    );
    raise exception 'RELIABLE_CANONICAL_URL_DUPLICATE_UNEXPECTED_SUCCESS';
  exception when unique_violation then
    raise notice 'PASS NEUTRAL_OFFER_AND_RELIABLE_URL_DEDUP';
  end;
end;
$$;

insert into public.job_offer_sources (
  id, job_offer_id, job_source_id, external_job_id,
  source_url, canonical_source_url
) values
  (
    '94000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    'synthetic-42',
    'https://board-a.example.invalid/jobs/42?utm_source=test',
    'https://board-a.example.invalid/jobs/42'
  ),
  (
    '95000000-0000-0000-0000-000000000002',
    '93000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000002',
    null,
    'https://board-b.example.invalid/vacancy?id=42&utm_campaign=test',
    'https://board-b.example.invalid/vacancy?id=42'
  );

do $$
declare
  source_count integer;
begin
  select count(*) into source_count
  from public.job_offer_sources
  where job_offer_id = '93000000-0000-0000-0000-000000000001';

  if source_count <> 2 then
    raise exception 'MULTI_SOURCE_FAILED count=%', source_count;
  end if;

  begin
    insert into public.job_offer_sources (
      job_offer_id, job_source_id, external_job_id,
      source_url, canonical_source_url
    ) values (
      '93000000-0000-0000-0000-000000000001',
      '91000000-0000-0000-0000-000000000001',
      'synthetic-42',
      'https://board-a.example.invalid/another-url',
      'https://board-a.example.invalid/another-url'
    );
    raise exception 'EXTERNAL_ID_DUPLICATE_UNEXPECTED_SUCCESS';
  exception when unique_violation then
    raise notice 'PASS SOURCE_EXTERNAL_ID_DEDUP';
  end;

  begin
    insert into public.job_offer_sources (
      job_offer_id, job_source_id, external_job_id,
      source_url, canonical_source_url
    ) values (
      '93000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000002',
      null,
      'https://board-b.example.invalid/vacancy?id=42&utm_medium=email',
      'https://board-b.example.invalid/vacancy?id=42'
    );
    raise exception 'CANONICAL_SOURCE_URL_DUPLICATE_UNEXPECTED_SUCCESS';
  exception when unique_violation then
    raise notice 'PASS SOURCE_URL_DEDUP_AND_MULTI_SOURCE';
  end;
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '96000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'phase4-user@example.invalid',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  visible_offers integer;
begin
  select count(*) into visible_offers from public.job_offers;
  if visible_offers <> 1 then
    raise exception 'GLOBAL_READ_FAILED rows=%', visible_offers;
  end if;

  begin
    insert into public.job_offers (title) values ('Unauthorized synthetic offer');
    raise exception 'AUTHENTICATED_INSERT_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.job_offers set status = 'REMOVED';
    raise exception 'AUTHENTICATED_UPDATE_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    null;
  end;

  begin
    delete from public.job_offers;
    raise exception 'AUTHENTICATED_DELETE_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    raise notice 'PASS AUTHENTICATED_GLOBAL_READ_ONLY';
  end;
end;
$$;

reset role;

select array[
  'COMPANY_NORMALIZATION_AND_DEDUP',
  'NEUTRAL_JOB_OFFER_WITHOUT_USER_ID',
  'DESCRIPTION_HASH',
  'SOURCE_EXTERNAL_ID_DEDUP',
  'CANONICAL_SOURCE_URL_DEDUP',
  'RELIABLE_CANONICAL_URL_DEDUP',
  'MULTI_SOURCE_OFFER',
  'AUTHENTICATED_GLOBAL_READ_ONLY'
] as passed_runtime_checks;

rollback;
