begin;
insert into auth.users (id,instance_id,aud,role,email,encrypted_password) values
('99000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','a','phase9a9-a@example.test',''),
('99000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','a','phase9a9-b@example.test','');
set local role service_role;
insert into public.candidate_profiles(id,user_id,name) values
('99100000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000001','Evidence A'),
('99100000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000002','Evidence B');
insert into public.professional_evidence_profiles(id,user_id,candidate_profile_id,subject_type,display_name) values
('99200000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000001','99100000-0000-4000-8000-000000000001','PROJECT','Verified Portal');
insert into public.professional_evidence_items(user_id,candidate_profile_id,profile_id,category,exact_claim,source_type,source_reference,verification_status) values
('99000000-0000-4000-8000-000000000001','99100000-0000-4000-8000-000000000001','99200000-0000-4000-8000-000000000001','TECHNOLOGY','React','APPROVED_RESUME','resume line','VERIFIED');
set local role authenticated;
select set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000002',true);
do $$ begin if exists(select 1 from public.professional_evidence_items) then raise exception 'Cross-user evidence visible'; end if; end $$;
select set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000001',true);
do $$ begin if (select count(*) from public.professional_evidence_items) <> 1 then raise exception 'Owner evidence missing'; end if; end $$;
rollback;
