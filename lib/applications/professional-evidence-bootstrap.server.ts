import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { RESUME_EXTRACTOR_VERSION } from "./resume-extractor.server";
import { approvedResumeEvidencePlan, approvedResumeEvidencePlanFromBlocks, approvedResumeSourceReference } from "./professional-evidence-bootstrap";
import type { CandidateEvidence, ResumeStructure } from "./types";

type ExistingSubject = { id: string; subject_type: "PROJECT" | "EMPLOYMENT"; display_name: string; employment_company: string | null; employment_dates: string | null };
const normalize = (value: string) => value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const subjectKey = (subject: Pick<ExistingSubject, "subject_type" | "display_name" | "employment_company" | "employment_dates">) =>
  `${subject.subject_type === "PROJECT" ? "project" : "employment"}:${normalize([subject.display_name, subject.employment_company ?? "", subject.employment_dates ?? ""].join("|"))}`;

export async function bootstrapApprovedResumeEvidence(client: SupabaseClient, userId: string, candidateProfileId: string) {
  const { data: resume } = await client.from("resumes").select("id").eq("user_id", userId).eq("candidate_profile_id", candidateProfileId).eq("status", "APPROVED").is("deleted_at", null).maybeSingle();
  if (!resume) return { createdSubjects: 0, createdItems: 0, createdUrls: 0 };
  const { data: extraction } = await client.from("resume_extractions").select("structured_content").eq("user_id", userId).eq("candidate_profile_id", candidateProfileId).eq("source_resume_id", resume.id).eq("extractor_version", RESUME_EXTRACTOR_VERSION).maybeSingle();
  // A previously prepared application already stores CandidateEvidence built
  // from this same approved resume. It is a safe fallback; no PDF is read or
  // re-analysed while opening the profile page.
  const { data: draft } = extraction ? { data: null } : await client.from("application_drafts").select("profile_analysis").eq("user_id", userId).eq("candidate_profile_id", candidateProfileId).eq("source_resume_id", resume.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const plan = extraction
    ? approvedResumeEvidencePlan(extraction.structured_content as ResumeStructure)
    : approvedResumeEvidencePlanFromBlocks(((draft?.profile_analysis as CandidateEvidence | null)?.blocks ?? []));
  if (!plan.length) return { createdSubjects: 0, createdItems: 0, createdUrls: 0 };
  const [{ data: existingSubjects }, { data: existingItems }, { data: existingUrls }] = await Promise.all([
    client.from("professional_evidence_profiles").select("id,subject_type,display_name,employment_company,employment_dates").eq("user_id", userId).eq("candidate_profile_id", candidateProfileId),
    client.from("professional_evidence_items").select("id,profile_id,category,exact_claim,source_reference").eq("user_id", userId).eq("candidate_profile_id", candidateProfileId).eq("source_type", "APPROVED_RESUME"),
    client.from("professional_evidence_urls").select("id,profile_id,url,url_type,source_reference").eq("user_id", userId).eq("candidate_profile_id", candidateProfileId).eq("source_type", "APPROVED_RESUME"),
  ]);
  const subjects = new Map((existingSubjects as ExistingSubject[] ?? []).map(subject => [subjectKey(subject), subject.id]));
  const generatedPrefix = `approved-resume:${resume.id}:`;
  const generatedItems = (existingItems ?? []).filter(item => (item.source_reference as string).startsWith(generatedPrefix));
  const generatedUrls = (existingUrls ?? []).filter(url => (url.source_reference as string).startsWith(generatedPrefix));
  const existingItemByReference = new Map(generatedItems.map(item => [item.source_reference as string, item]));
  const existingUrlByReference = new Map(generatedUrls.map(url => [url.source_reference as string, url]));
  let createdSubjects = 0; let createdItems = 0; let createdUrls = 0;

  const expectedItems: Array<{ profile_id: string; category: string; exact_claim: string; source_reference: string }> = [];
  const expectedUrls: Array<{ profile_id: string; url: string; url_type: string; source_reference: string }> = [];
  for (const proposed of plan) {
    let profileId = subjects.get(proposed.key);
    if (!profileId) {
      const { data, error } = await client.from("professional_evidence_profiles").insert({ user_id: userId, candidate_profile_id: candidateProfileId, subject_type: proposed.subject_type, display_name: proposed.display_name, description: proposed.description, employment_role: proposed.employment_role, employment_company: proposed.employment_company, employment_dates: proposed.employment_dates, employment_location: proposed.employment_location }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "No se pudo importar la evidencia aprobada.");
      profileId = data.id as string; subjects.set(proposed.key, profileId); createdSubjects++;
    }
    expectedItems.push(...proposed.claims.map(claim => ({ profile_id: profileId!, category: claim.category, exact_claim: claim.exact_claim, source_reference: approvedResumeSourceReference(resume.id as string, proposed.key, claim.key) })));
    expectedUrls.push(...proposed.urls.map(url => ({ profile_id: profileId!, url: url.url, url_type: url.url_type, source_reference: approvedResumeSourceReference(resume.id as string, proposed.key, url.key) })));
  }
  const expectedItemReferences = new Set(expectedItems.map(item => item.source_reference));
  const expectedUrlReferences = new Set(expectedUrls.map(url => url.source_reference));
  const staleItemIds = generatedItems.filter(item => !expectedItemReferences.has(item.source_reference as string)).map(item => item.id as string);
  const staleUrlIds = generatedUrls.filter(url => !expectedUrlReferences.has(url.source_reference as string)).map(url => url.id as string);
  if (staleItemIds.length) {
    const { error } = await client.from("professional_evidence_items").delete().in("id", staleItemIds).eq("user_id", userId).eq("source_type", "APPROVED_RESUME");
    if (error) throw new Error(error.message);
  }
  if (staleUrlIds.length) {
    const { error } = await client.from("professional_evidence_urls").delete().in("id", staleUrlIds).eq("user_id", userId).eq("source_type", "APPROVED_RESUME");
    if (error) throw new Error(error.message);
  }
  for (const item of expectedItems) {
    const current = existingItemByReference.get(item.source_reference);
    if (!current) {
      const { error } = await client.from("professional_evidence_items").insert({ ...item, user_id: userId, candidate_profile_id: candidateProfileId, source_type: "APPROVED_RESUME", verification_status: "VERIFIED", relevance_tags: [] });
      if (error) throw new Error(error.message); createdItems++;
    } else if (current.profile_id !== item.profile_id || current.category !== item.category || current.exact_claim !== item.exact_claim) {
      const { error } = await client.from("professional_evidence_items").update(item).eq("id", current.id).eq("user_id", userId).eq("source_type", "APPROVED_RESUME");
      if (error) throw new Error(error.message);
    }
  }
  for (const url of expectedUrls) {
    const current = existingUrlByReference.get(url.source_reference);
    if (!current) {
      const { error } = await client.from("professional_evidence_urls").insert({ ...url, user_id: userId, candidate_profile_id: candidateProfileId, source_type: "APPROVED_RESUME", verification_status: "VERIFIED", confirmed_at: null });
      if (error) throw new Error(error.message); createdUrls++;
    } else if (current.profile_id !== url.profile_id || current.url !== url.url || current.url_type !== url.url_type) {
      const { error } = await client.from("professional_evidence_urls").update(url).eq("id", current.id).eq("user_id", userId).eq("source_type", "APPROVED_RESUME");
      if (error) throw new Error(error.message);
    }
  }
  return { createdSubjects, createdItems, createdUrls };
}
