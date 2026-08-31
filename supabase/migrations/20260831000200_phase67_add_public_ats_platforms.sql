begin;

alter type public.company_career_platform add value if not exists 'GREENHOUSE';
alter type public.company_career_platform add value if not exists 'SMARTRECRUITERS';

commit;
