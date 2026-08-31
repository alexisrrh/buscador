-- Runtime validation for Phase 6.9 batch ingestion and matching. Synthetic data only.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '69000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'phase69@example.invalid', '', now(),
  '{}', '{}', now(), now()
);

set local role service_role;

insert into public.candidate_profiles (id, user_id, name, seniority)
values (
  '69100000-0000-0000-0000-000000000001',
  '69000000-0000-0000-0000-000000000001',
  'Synthetic Batch Candidate', 'MID'
);

insert into public.search_profiles (
  id, user_id, candidate_profile_id, name, status, notification_min_score,
  semi_auto_min_score, auto_apply_min_score
) values (
  '69200000-0000-0000-0000-000000000001',
  '69000000-0000-0000-0000-000000000001',
  '69100000-0000-0000-0000-000000000001',
  'Synthetic Batch Search', 'ACTIVE', 70, 80, 90
);

insert into public.job_preferences (
  user_id, candidate_profile_id, search_profile_id, search_profile_version,
  target_titles, work_modes
) values (
  '69000000-0000-0000-0000-000000000001',
  '69100000-0000-0000-0000-000000000001',
  '69200000-0000-0000-0000-000000000001',
  1, array['Frontend Engineer'], array['REMOTE']
);

insert into public.companies (id, name)
values ('69300000-0000-0000-0000-000000000001', 'Synthetic Batch Company');

insert into public.company_career_sources (
  id, company_id, platform, identifier, careers_url
) values (
  '69400000-0000-0000-0000-000000000001',
  '69300000-0000-0000-0000-000000000001',
  'GREENHOUSE', 'synthetic-phase69',
  'https://job-boards.greenhouse.io/synthetic-phase69'
);

do $$
declare
  offers jsonb;
  first_run jsonb;
  second_run jsonb;
  changed_run jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'batch_index', n - 1,
    'source_code', 'GREENHOUSE',
    'source_name', 'Greenhouse',
    'source_base_url', 'https://boards-api.greenhouse.io',
    'company_career_source_id', '69400000-0000-0000-0000-000000000001',
    'external_job_id', 'phase69-' || n,
    'source_url', 'https://example.invalid/phase69/' || n,
    'canonical_source_url', 'https://example.invalid/phase69/' || n,
    'title', 'Synthetic Frontend Engineer ' || n,
    'description', 'React TypeScript batch offer',
    'location_text', 'Remote Spain',
    'country_code', 'ES',
    'work_mode', 'REMOTE',
    'canonical_url', 'https://example.invalid/phase69/' || n,
    'canonical_url_is_reliable', true,
    'status', 'ACTIVE',
    'raw_payload', jsonb_build_object('synthetic', n)
  ) order by n)
  into offers
  from generate_series(1, 200) n;

  first_run := public.ingest_company_career_job_offers_batch(offers, '2026-08-31T10:00:00Z');
  second_run := public.ingest_company_career_job_offers_batch(offers, '2026-08-31T11:00:00Z');
  changed_run := public.ingest_company_career_job_offers_batch(
    jsonb_build_array(jsonb_set(offers->0, '{description}', '"Changed React description"')),
    '2026-08-31T12:00:00Z'
  );

  if (first_run->>'created')::integer <> 200
     or (second_run->>'unchanged')::integer <> 200
     or (changed_run->>'updated')::integer <> 1
     or (select count(*) from public.job_offers where canonical_url like 'https://example.invalid/phase69/%') <> 200 then
    raise exception 'BATCH_OFFER_RESULTS_FAILED first=% second=% changed=%',
      first_run, second_run, changed_run;
  end if;
  raise notice 'PASS BATCH_200_IDEMPOTENT_AND_CHANGE_DETECTION';
end;
$$;

do $$
declare
  matches jsonb;
  first_run jsonb;
  repeat_run jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'job_offer_id', offer.id,
    'scoring_version', 'deterministic-v2',
    'score', 80 + offer.position,
    'eligibility_status', 'ELIGIBLE',
    'score_components', '{"title":35}'::jsonb,
    'hard_gates', '{"roleFamily":"PASS"}'::jsonb,
    'reasons', '["Synthetic batch match"]'::jsonb
  ) order by offer.id)
  into matches
  from (
    select id, row_number() over (order by id) position from public.job_offers
    where canonical_url like 'https://example.invalid/phase69/%'
    order by id limit 3
  ) offer;

  first_run := public.upsert_job_matches_batch(
    '69200000-0000-0000-0000-000000000001', matches
  );

  with ranked as (
    select id, row_number() over (order by id) position
    from public.job_matches
    where search_profile_id = '69200000-0000-0000-0000-000000000001'
  )
  update public.job_matches match
  set status = case ranked.position
    when 1 then 'SAVED'::public.job_match_status
    when 2 then 'DISMISSED'::public.job_match_status
    else 'APPLIED'::public.job_match_status
  end
  from ranked
  where match.id = ranked.id;

  repeat_run := public.upsert_job_matches_batch(
    '69200000-0000-0000-0000-000000000001', matches
  );

  if (first_run->>'created')::integer <> 3
     or (repeat_run->>'updated')::integer <> 3
     or (select count(*) from public.job_matches
         where search_profile_id = '69200000-0000-0000-0000-000000000001'
           and status in ('SAVED', 'DISMISSED', 'APPLIED')) <> 3 then
    raise exception 'BATCH_MATCH_STATUS_FAILED first=% repeat=%', first_run, repeat_run;
  end if;
  raise notice 'PASS BATCH_MATCHES_PRESERVE_USER_STATUS';
end;
$$;

rollback;
