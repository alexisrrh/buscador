import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfessionalEvidenceBank, ProfessionalEvidenceItem } from "./types";

type EvidenceRow = Omit<ProfessionalEvidenceItem, "subject_type" | "display_name"> & {
  professional_evidence_profiles: { subject_type: ProfessionalEvidenceItem["subject_type"]; display_name: string };
};

export async function loadProfessionalEvidenceBank(client: SupabaseClient, userId: string, candidateProfileId: string): Promise<ProfessionalEvidenceBank> {
  const { data, error } = await client.from("professional_evidence_items")
    .select("id,profile_id,category,exact_claim,source_type,source_reference,verification_status,confirmed_at,relevance_tags,professional_evidence_profiles!inner(subject_type,display_name,user_id,candidate_profile_id)")
    .eq("user_id", userId).eq("candidate_profile_id", candidateProfileId);
  if (error || !data) return { items: [] };
  return { items: (data as unknown as EvidenceRow[]).map(row => ({
    id: row.id, profile_id: row.profile_id, subject_type: row.professional_evidence_profiles.subject_type,
    display_name: row.professional_evidence_profiles.display_name, category: row.category, exact_claim: row.exact_claim,
    source_type: row.source_type, source_reference: row.source_reference, verification_status: row.verification_status,
    confirmed_at: row.confirmed_at, relevance_tags: row.relevance_tags ?? [],
  } satisfies ProfessionalEvidenceItem)) };
}
