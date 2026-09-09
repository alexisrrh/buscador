import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { structureResumeText } from "@/lib/applications/analysis";
import { RESUME_EXTRACTOR_VERSION } from "@/lib/applications/resume-extractor.server";
import { approvedResumeEvidencePlan, approvedResumeEvidencePlanFromBlocks, approvedResumeSourceReference } from "@/lib/applications/professional-evidence-bootstrap";
import { bootstrapApprovedResumeEvidence } from "@/lib/applications/professional-evidence-bootstrap.server";
import type { EvidenceBlock } from "@/lib/applications/types";

const source = `PROYECTOS
Full Stack Developer
https://nutri.example.dev
NutriSmartCoach | React · Node.js
Construí una aplicación para organizar planes nutricionales.
Implementé autenticación con Supabase Auth.
EXPERIENCIA
Instalador de paneles solares
Solar Example
02/2024 - 12/2024
Montaje de instalaciones.
`;

describe("approved resume evidence bootstrap", () => {
  it("projects known approved-resume projects, employment, claims and URLs without re-analysis", () => {
    const structured = structureResumeText(source);
    structured.links = [{ text: "NutriSmartCoach", url: "https://nutri.example.dev" }];
    const plan = approvedResumeEvidencePlan(structured);
    const project = plan.find(subject => subject.subject_type === "PROJECT");
    const employment = plan.find(subject => subject.subject_type === "EMPLOYMENT");
    expect(project).toMatchObject({ display_name: "NutriSmartCoach" });
    expect(project?.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ exact_claim: "React", category: "TECHNOLOGY" }),
      expect.objectContaining({ exact_claim: "Implementé autenticación con Supabase Auth.", category: "AUTH" }),
    ]));
    expect(project?.urls).toEqual(expect.arrayContaining([expect.objectContaining({ url: "https://nutri.example.dev/" })]));
    expect(employment).toMatchObject({ display_name: "Instalador de paneles solares", employment_company: "Solar Example", employment_dates: "02/2024 - 12/2024" });
  });

  it("uses stable approved-resume provenance keys so repeated bootstrap cannot duplicate claims or URLs", () => {
    const structured = structureResumeText(source);
    structured.links = [{ text: "NutriSmartCoach", url: "https://nutri.example.dev" }];
    const first = approvedResumeEvidencePlan(structured);
    const second = approvedResumeEvidencePlan(structured);
    expect(second).toEqual(first);
    const project = first.find(subject => subject.subject_type === "PROJECT")!;
    const references = project.claims.map(claim => approvedResumeSourceReference("resume-a", project.key, claim.key));
    const urlReferences = project.urls.map(url => approvedResumeSourceReference("resume-a", project.key, url.key));
    expect(new Set([...references, ...urlReferences]).size).toBe(references.length + urlReferences.length);
  });

  it("returns no bank subjects for a resume without approved professional sections, leaving manual entry available", () => {
    expect(approvedResumeEvidencePlan(structureResumeText("PERFIL\nCandidato\nFORMACIÓN\nCurso"))).toEqual([]);
  });
  it("normalizes canonical-style evidence without false technologies, fragments, or weak technical categories", () => {
    const blocks: EvidenceBlock[] = [
      { id: "p1", kind: "project", title: "NutriSmartCoach | React · Node.js · Supabase", identity_lines: ["NutriSmartCoach | React · Node.js · Supabase"], lines: ["Full Stack Developer", "NutriSmartCoach | React · Node.js · Supabase", "Aplicación para dietas personalizadas y", "generación de dietas personalizadas."], skills: [], links: ["https://nutri.example.dev/"] , technical: true },
      { id: "p2", kind: "project", title: "Consultorio Odontológico LAC | React · PostgreSQL", identity_lines: ["Consultorio Odontológico LAC | React · PostgreSQL"], lines: ["Full Stack Developer", "Consultorio Odontológico LAC | React · PostgreSQL", "Gestión de pacientes e historiales."], skills: [], links: [], technical: true },
      { id: "p3", kind: "project", title: "VHSFlix | React · Python · JWT", identity_lines: ["VHSFlix | React · Python · JWT"], lines: ["Full Stack Developer", "VHSFlix | React · Python · JWT", "Catálogo de películas con autenticación JWT."], skills: [], links: [], technical: true },
      { id: "e1", kind: "employment", title: "Atención al Cliente", identity_lines: ["Atención al Cliente", "Carrefour Express", "10/2022 - 12/2023", "Argüelles, Madrid"], lines: ["Atención al Cliente", "Carrefour Express", "10/2022 - 12/2023", "Argüelles, Madrid"], skills: ["Express"], links: [], technical: false },
      { id: "e2", kind: "employment", title: "Atención al Cliente", identity_lines: ["Atención al Cliente", "Isadri S.L.", "01/2024 - 01/2025"], lines: ["Atención al Cliente", "Isadri S.L.", "01/2024 - 01/2025", "Gestión integral de atención al cliente, resolviendo incidencias."], skills: [], links: [], technical: false },
      { id: "e3", kind: "employment", title: "Instalador", identity_lines: ["Instalador", "Solar Example", "2024"], lines: ["Instalador", "Solar Example", "2024", "Montaje de instalaciones en parques fotovoltaicos a", "gran escala"], skills: [], links: [], technical: false },
    ];
    const plan = approvedResumeEvidencePlanFromBlocks(blocks);
    const nutri = plan.find(subject => subject.display_name === "NutriSmartCoach")!;
    const lac = plan.find(subject => subject.display_name.includes("LAC"))!;
    const vhs = plan.find(subject => subject.display_name === "VHSFlix")!;
    const carrefour = plan.find(subject => subject.employment_company === "Carrefour Express")!;
    const isadri = plan.find(subject => subject.employment_company === "Isadri S.L.")!;
    const solar = plan.find(subject => subject.employment_company === "Solar Example")!;
    expect(nutri.claims.map(claim => claim.exact_claim)).toContain("Aplicación para dietas personalizadas y generación de dietas personalizadas.");
    expect(nutri.claims.filter(claim => claim.category === "TECHNOLOGY").map(claim => claim.exact_claim)).toEqual(expect.arrayContaining(["React", "Node.js", "Supabase"]));
    expect(lac.claims.map(claim => claim.exact_claim)).toContain("React");
    expect(vhs.claims.filter(claim => claim.category === "TECHNOLOGY").map(claim => claim.exact_claim)).toEqual(expect.arrayContaining(["JWT", "React", "Python"]));
    expect(carrefour.claims.some(claim => claim.exact_claim === "Express" || claim.category === "TECHNOLOGY")).toBe(false);
    expect(isadri.claims).toContainEqual(expect.objectContaining({ category: "RESPONSIBILITY", exact_claim: "Gestión integral de atención al cliente, resolviendo incidencias." }));
    expect(isadri.claims.some(claim => claim.category === "API_INTEGRATION")).toBe(false);
    expect(solar.claims).toContainEqual(expect.objectContaining({ exact_claim: "Montaje de instalaciones en parques fotovoltaicos a gran escala", category: "RESPONSIBILITY" }));
  });

  it.skipIf(process.env.RUN_LOCAL_SUPABASE_BOOTSTRAP_TEST !== "1")("bootstraps and reconciles only approved evidence for its local fixture user", async () => {
    const url = process.env.LOCAL_SUPABASE_URL ?? "";
    const serviceRoleKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ?? "";
    expect(url).toMatch(/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/);
    expect(serviceRoleKey).not.toBe("");
    const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const fixture = randomUUID();
    const users: string[] = [];
    const createUser = async (label: string) => {
      const { data, error } = await client.auth.admin.createUser({ email: `bootstrap-${label}-${fixture}@example.test`, password: "LocalBootstrapFixture!9", email_confirm: true });
      if (error || !data.user) throw new Error(error?.message ?? "Could not create local fixture user");
      users.push(data.user.id);
      const { data: profile, error: profileError } = await client.from("candidate_profiles").insert({ user_id: data.user.id, name: `Bootstrap ${label}` }).select("id").single();
      if (profileError || !profile) throw new Error(profileError?.message ?? "Could not create local fixture profile");
      return { userId: data.user.id, candidateProfileId: profile.id as string };
    };
    try {
      const a = await createUser("a");
      const b = await createUser("b");
      const structured = structureResumeText(source);
      structured.links = [{ text: "NutriSmartCoach", url: "https://nutri.example.dev" }];
      const { data: resume, error: resumeError } = await client.from("resumes").insert({ user_id: a.userId, candidate_profile_id: a.candidateProfileId, version: 1, status: "APPROVED", original_filename: "fixture.pdf", mime_type: "application/pdf", file_size_bytes: 1, content_sha256: "a".repeat(64), approved_at: new Date().toISOString() }).select("id").single();
      if (resumeError || !resume) throw new Error(resumeError?.message ?? "Could not create local fixture resume");
      const { error: extractionError } = await client.from("resume_extractions").insert({ user_id: a.userId, candidate_profile_id: a.candidateProfileId, source_resume_id: resume.id, extractor_version: RESUME_EXTRACTOR_VERSION, extracted_text: structured.lines.join("\n"), structured_content: structured });
      if (extractionError) throw new Error(extractionError.message);

      const run1 = await bootstrapApprovedResumeEvidence(client, a.userId, a.candidateProfileId);
      expect(run1.createdSubjects).toBeGreaterThan(0);
      expect(run1.createdItems).toBeGreaterThan(0);
      expect(run1.createdUrls).toBeGreaterThan(0);
      const { data: aSubjects, error: subjectsError } = await client.from("professional_evidence_profiles").select("id").eq("user_id", a.userId);
      if (subjectsError || !aSubjects?.length) throw new Error(subjectsError?.message ?? "Missing A subjects");
      const { data: approvedBefore, error: approvedError } = await client.from("professional_evidence_items").select("id,exact_claim").eq("user_id", a.userId).eq("source_type", "APPROVED_RESUME");
      if (approvedError || !approvedBefore?.length) throw new Error(approvedError?.message ?? "Missing approved evidence");
      const { error: confirmedError } = await client.from("professional_evidence_items").insert({ user_id: a.userId, candidate_profile_id: a.candidateProfileId, profile_id: aSubjects[0]!.id, category: "OTHER", exact_claim: "Manual evidence must remain", source_type: "USER_CONFIRMED", source_reference: "local fixture", verification_status: "VERIFIED", confirmed_at: new Date().toISOString(), relevance_tags: [] });
      if (confirmedError) throw new Error(confirmedError.message);
      const { error: corruptError } = await client.from("professional_evidence_items").update({ exact_claim: "Corrupted approved evidence" }).eq("id", approvedBefore[0]!.id).eq("user_id", a.userId).eq("source_type", "APPROVED_RESUME");
      if (corruptError) throw new Error(corruptError.message);

      const { data: bSubject, error: bSubjectError } = await client.from("professional_evidence_profiles").insert({ user_id: b.userId, candidate_profile_id: b.candidateProfileId, subject_type: "PROJECT", display_name: "B only" }).select("id").single();
      if (bSubjectError || !bSubject) throw new Error(bSubjectError?.message ?? "Could not create B subject");
      const { data: bEvidence, error: bEvidenceError } = await client.from("professional_evidence_items").insert({ user_id: b.userId, candidate_profile_id: b.candidateProfileId, profile_id: bSubject.id, category: "OTHER", exact_claim: "B remains untouched", source_type: "USER_CONFIRMED", source_reference: "local fixture", verification_status: "VERIFIED", confirmed_at: new Date().toISOString(), relevance_tags: [] }).select("id,exact_claim,source_type").single();
      if (bEvidenceError || !bEvidence) throw new Error(bEvidenceError?.message ?? "Could not create B evidence");

      const run2 = await bootstrapApprovedResumeEvidence(client, a.userId, a.candidateProfileId);
      expect(run2).toEqual({ createdSubjects: 0, createdItems: 0, createdUrls: 0 });
      const { data: approvedAfter } = await client.from("professional_evidence_items").select("exact_claim").eq("id", approvedBefore[0]!.id).single();
      const { data: confirmedAfter } = await client.from("professional_evidence_items").select("exact_claim,source_type").eq("user_id", a.userId).eq("source_type", "USER_CONFIRMED").single();
      const { data: bAfter } = await client.from("professional_evidence_items").select("id,exact_claim,source_type").eq("id", bEvidence.id).single();
      expect(approvedAfter?.exact_claim).toBe(approvedBefore[0]!.exact_claim);
      expect(confirmedAfter).toMatchObject({ exact_claim: "Manual evidence must remain", source_type: "USER_CONFIRMED" });
      expect(bAfter).toEqual(bEvidence);
    } finally {
      await Promise.all(users.map(userId => client.auth.admin.deleteUser(userId)));
    }
  }, 30000);
});
