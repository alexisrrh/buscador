import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { analyzeGaps, analyzeJobOffer, buildCandidateEvidence } from "@/lib/applications/analysis";
import { EvidenceBasedApplicationGenerator } from "@/lib/applications/generator";
import { extractResume } from "@/lib/applications/resume-extractor.server";
import { validateGeneratedApplication } from "@/lib/applications/validation";

const enabled = process.env.PHASE7_REAL_TEST === "1";

describe.skipIf(!enabled)("Phase 7 real approved resume smoke", () => {
  it("prepares evidence-based content for a real useful offer without writing or applying", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(url && key).toBeTruthy();
    const db = createClient(url!, key!, { auth: { persistSession: false } });
    const { data: search } = await db.from("search_profiles")
      .select("id,user_id,candidate_profile_id").eq("status", "ACTIVE").ilike("name", "%Frontend%")
      .is("deleted_at", null).order("created_at", { ascending: false }).limit(1).single();
    const [{ data: profile }, { data: resume }, { data: match }] = await Promise.all([
      db.from("candidate_profiles").select("name,headline,job_family,seniority").eq("id", search!.candidate_profile_id).single(),
      db.from("resumes").select("id,storage_bucket,storage_path,mime_type").eq("candidate_profile_id", search!.candidate_profile_id).eq("status", "APPROVED").is("deleted_at", null).single(),
      db.from("job_matches").select("job_offer_id,eligibility_status").eq("search_profile_id", search!.id).in("eligibility_status", ["ELIGIBLE", "REVIEW"]).order("score", { ascending: false }).limit(1).single(),
    ]);
    const { data: offer } = await db.from("job_offers")
      .select("title,description,location_text,work_mode,employment_type,salary_min,salary_max,salary_currency,companies(name)")
      .eq("id", match!.job_offer_id).single();
    const { data: file, error } = await db.storage.from(resume!.storage_bucket).download(resume!.storage_path);
    expect(error).toBeNull();
    const extraction = await extractResume(await file!.arrayBuffer(), resume!.mime_type);
    const job = analyzeJobOffer(offer as never);
    const evidence = buildCandidateEvidence(profile!, extraction.structured, job);
    const gaps = analyzeGaps(job, evidence);
    const generated = validateGeneratedApplication(
      await new EvidenceBasedApplicationGenerator().generate({ job, evidence, gaps }), evidence,
    );
    expect(extraction.structured.lines.length).toBeGreaterThan(0);
    expect(generated.recruiter_message).toBeTruthy();
    expect(generated.cover_letter).toBeNull();
  }, 30_000);
});
