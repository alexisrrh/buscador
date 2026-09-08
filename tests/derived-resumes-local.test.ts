// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, it, expect } from "vitest";
import { renderResumePdf } from "@/lib/derived-resumes/renderer.server";
import { generateDerivedResume, selectDerivedResume } from "@/lib/derived-resumes/service.server";
import { extractResume } from "@/lib/applications/resume-extractor.server";
import { analyzeJobOffer, buildCandidateEvidence } from "@/lib/applications/analysis";

describe.skipIf(process.env.PHASE9A_LOCAL_TEST !== "1")("Phase 9A local storage integration (synthetic only)", () => {
  it("renders two immutable private versions, rejects invalid adaptation and isolates users", async () => {
    const url = process.env.PHASE9A_LOCAL_URL!;
    if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("Local database only");
    const db = createClient(url, process.env.PHASE9A_LOCAL_SERVICE_KEY!, { auth: { persistSession: false } });
    const userClient = () => createClient(url, process.env.PHASE9A_LOCAL_ANON_KEY!, { auth: { persistSession: false } });
    const email = `phase9a-${randomUUID()}@example.test`;
    const password = randomUUID();
    const { data: user, error: userError } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    expect(userError).toBeNull();
    const userId = user.user!.id;
    const authClient = userClient();
    expect((await authClient.auth.signInWithPassword({ email, password })).error).toBeNull();
    const profile = { name: "Persona Sintética", headline: "Web Developer", job_family: null, seniority: null };
    const { data: candidate, error: profileError } = await db.from("candidate_profiles").insert({ ...profile, user_id: userId }).select().single();
    expect(profileError).toBeNull();
    const { data: search } = await db.from("search_profiles").insert({ user_id: userId, candidate_profile_id: candidate!.id, name: "Synthetic search" }).select().single();
    const { data: offer } = await db.from("job_offers").insert({ title: "Web Developer", canonical_url: "https://example.test/phase9a", description: "TypeScript required" }).select().single();
    const source = await renderResumePdf({ name: profile.name, title: profile.headline, target: "Web Developer", contact: [email], sections: [
      { heading: "Experiencia", lines: ["Synthetic Company — Developer — 2020–2024", "Aplicaciones TypeScript."] },
      { heading: "Educación", lines: ["Universidad Ejemplo — Informática — 2016–2020"] },
    ] });
    const { data: resume, error: resumeError } = await db.from("resumes").insert({ user_id: userId, candidate_profile_id: candidate!.id, version: 1, status: "APPROVED", approved_at: new Date().toISOString(), original_filename: "synthetic.pdf", mime_type: source.mime_type, file_size_bytes: source.size_bytes, content_sha256: source.sha256 }).select().single();
    expect(resumeError).toBeNull();
    expect((await db.storage.from("private-resumes").upload(resume!.storage_path, source.bytes, { contentType: source.mime_type })).error).toBeNull();
    const extraction = await extractResume(Uint8Array.from(source.bytes).buffer, source.mime_type);
    const job = analyzeJobOffer({ ...offer!, companies: null });
    const evidence = buildCandidateEvidence(profile, extraction.structured, job);
    const adaptation = { professional_summary: profile.headline, prioritized_skills: ["TypeScript"], ats_keywords: [], excluded_requested_skills: [], experience_sections: evidence.experience_lines, project_sections: [], education: evidence.education_lines };
    const { data: draft, error: draftError } = await db.from("application_drafts").insert({ user_id: userId, candidate_profile_id: candidate!.id, search_profile_id: search!.id, job_offer_id: offer!.id, source_resume_id: resume!.id, status: "APPROVED", job_analysis: job, profile_analysis: evidence, resume_adaptation: adaptation, match_summary: {} }).select().single();
    expect(draftError).toBeNull();
    const input = { authClient, userId, draftId: draft!.id, serviceClient: db };
    const first = await generateDerivedResume(input);
    const second = await generateDerivedResume(input);
    expect(first.id).not.toBe(second.id);
    const { data: artifacts } = await db.from("derived_resumes").select().eq("application_draft_id", draft!.id).order("created_at");
    expect(artifacts).toHaveLength(2);
    expect(artifacts![0].storage_path).not.toBe(artifacts![1].storage_path);
    const originalFile = await db.storage.from("private-resumes").download(resume!.storage_path);
    expect(Buffer.from(await originalFile.data!.arrayBuffer())).toEqual(source.bytes);
    const file = await db.storage.from("derived-resumes").download(artifacts![0].storage_path);
    expect(file.error).toBeNull();
    expect(file.data!.size).toBe(first.size_bytes);
    expect(createHash("sha256").update(Buffer.from(await file.data!.arrayBuffer())).digest("hex")).toBe(first.sha256);
    const overwrite = await db.storage.from("derived-resumes").upload(artifacts![0].storage_path, source.bytes, { upsert: true, contentType: source.mime_type });
    expect(overwrite.error).not.toBeNull();
    const anonymous = userClient();
    expect((await anonymous.storage.from("derived-resumes").download(artifacts![0].storage_path)).error).not.toBeNull();
    const { data: secondUser } = await db.auth.admin.createUser({ email: `phase9a-b-${randomUUID()}@example.test`, password, email_confirm: true });
    const other = userClient();
    await other.auth.signInWithPassword({ email: secondUser.user!.email!, password });
    expect((await other.from("derived_resumes").select().eq("id", first.id)).data).toEqual([]);
    expect((await other.storage.from("derived-resumes").download(artifacts![0].storage_path)).error).not.toBeNull();
    const { data: app, error: appError } = await db.rpc("create_prepared_application", { p_user_id: userId, p_application_draft_id: draft!.id, p_job_offer_source_id: null, p_apply_mode: "MANUAL", p_target_url: "https://example.test/phase9a", p_status: "PREPARED", p_decision_reasons: [], p_safety_checklist: {}, p_failure_code: null, p_failure_message_public: null, p_answers: [] });
    expect(appError).toBeNull();
    await selectDerivedResume({ ...input, derivedId: first.id });
    expect((await db.from("applications").select("derived_resume_id").eq("id", app.id).single()).data?.derived_resume_id).toBe(first.id);
    await generateDerivedResume(input);
    expect((await db.from("applications").select("derived_resume_id").eq("id", app.id).single()).data?.derived_resume_id).toBe(first.id);
    await db.from("application_drafts").update({ resume_adaptation: { ...adaptation, prioritized_skills: ["AWS"] } }).eq("id", draft!.id);
    await expect(generateDerivedResume(input)).rejects.toMatchObject({ code: "INVALID_ADAPTATION" });
    const { data: failed } = await db.from("derived_resumes").select().eq("application_draft_id", draft!.id).eq("status", "FAILED").single();
    expect(failed!.failure_code).toBe("INVALID_ADAPTATION");
    expect((await db.storage.from("derived-resumes").download(failed!.storage_path)).error).not.toBeNull();
    await db.from("application_drafts").update({ resume_adaptation: adaptation }).eq("id", draft!.id);
    const brokenStorage = new Proxy(db, { get(target, property, receiver) {
      if (property !== "storage") return Reflect.get(target, property, receiver);
      return { from(bucket: string) {
        return bucket === "derived-resumes" ? { upload: async () => ({ error: { message: "synthetic storage failure" } }) } : target.storage.from(bucket);
      } };
    } });
    await expect(generateDerivedResume({ ...input, serviceClient: brokenStorage })).rejects.toMatchObject({ code: "STORAGE_FAILED" });
    expect((await db.from("derived_resumes").select("status").eq("application_draft_id", draft!.id).eq("failure_code", "STORAGE_FAILED").single()).data?.status).toBe("FAILED");
    // Synthetic fixtures intentionally retained locally for inspection; db reset removes them.
  }, 60000);
});
