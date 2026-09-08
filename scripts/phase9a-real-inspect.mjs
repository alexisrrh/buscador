import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await db.from("application_drafts").select("id,status,source_resume_id,job_offer_id,job_analysis").eq("status", "APPROVED");
if (error) { console.error(JSON.stringify({ status: "FAIL", code: error.code ?? "REMOTE_READ_FAILED" })); process.exitCode = 1; }
else console.log(JSON.stringify({ status: data.length ? "APPROVED_DRAFT_AVAILABLE" : "BLOCKED_USER_DATA", drafts: data.map(d => ({ id: d.id, source_resume_id: d.source_resume_id, job_offer_id: d.job_offer_id, title: d.job_analysis?.job_title, company: d.job_analysis?.company })) }));
