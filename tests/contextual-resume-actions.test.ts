import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), requireUser: vi.fn(), bootstrap: vi.fn(), redirect: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/applications/professional-evidence-bootstrap.server", () => ({ bootstrapApprovedResumeEvidence: mocks.bootstrap }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { approveResume, finishResumeUpload, prepareContextualResumeUpload } from "@/app/actions/resumes";

const profileId = "00000000-0000-4000-8000-000000000001";

function input() {
  return { originalFilename: "resume.pdf", mimeType: "application/pdf", fileSizeBytes: 12, contentSha256: "a".repeat(64) };
}

describe("contextual resume upload action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bootstrap.mockResolvedValue({ createdSubjects: 0, createdItems: 0, createdUrls: 0 });
    mocks.requireUser.mockResolvedValue({ user: { id: "user-a" }, supabase: { rpc: mocks.rpc, from: mocks.from } });
    mocks.rpc.mockImplementation(async (name: string) => name === "ensure_contextual_candidate_profile"
      ? { data: [{ candidate_profile_id: profileId, resolution: "CREATED" }], error: null }
      : { data: [{ id: "resume-a", candidate_profile_id: profileId }], error: null });
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            in: () => ({
              is: () => ({ neq: () => Promise.resolve({ data: [], error: null }) }),
            }),
          }),
        }),
      }),
    });
  });

  it("ensures the internal profile only when no profile id was supplied", async () => {
    const result = await prepareContextualResumeUpload(input());
    expect(result).toMatchObject({ resume: { id: "resume-a" } });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "ensure_contextual_candidate_profile");
    expect(mocks.rpc).toHaveBeenLastCalledWith("create_resume_upload", expect.objectContaining({ p_candidate_profile_id: profileId }));
  });

  it("does not accept an ambiguous internal profile resolution", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ candidate_profile_id: null, resolution: "AMBIGUOUS" }], error: null });
    await expect(prepareContextualResumeUpload(input())).resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("passes an explicitly selected profile to the existing owner-checked upload RPC", async () => {
    await prepareContextualResumeUpload({ ...input(), candidateProfileId: profileId });
    expect(mocks.rpc).not.toHaveBeenCalledWith("ensure_contextual_candidate_profile");
    expect(mocks.rpc).toHaveBeenCalledWith("create_resume_upload", expect.objectContaining({ p_candidate_profile_id: profileId }));
  });

  it("approves a first upload only after the existing completion RPC succeeds and no other usable CV exists", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "complete_resume_upload") return { data: [{ id: "resume-a", candidate_profile_id: profileId }], error: null };
      if (name === "approve_resume") return { data: null, error: null };
      return { data: null, error: null };
    });

    await expect(finishResumeUpload("resume-a", true)).resolves.toEqual({ ok: true, approved: true });
    expect(mocks.rpc).toHaveBeenCalledWith("complete_resume_upload", { p_resume_id: "resume-a" });
    expect(mocks.rpc).toHaveBeenCalledWith("approve_resume", { p_resume_id: "resume-a" });
    expect(mocks.bootstrap).toHaveBeenCalledWith(expect.anything(), "user-a", profileId);
  });

  it("keeps an auto-approved CV approved when bootstrap has a transient failure", async () => {
    mocks.bootstrap.mockRejectedValueOnce(new Error("temporary bootstrap failure"));
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "complete_resume_upload") return { data: [{ id: "resume-a", candidate_profile_id: profileId }], error: null };
      if (name === "approve_resume") return { data: null, error: null };
      return { data: null, error: null };
    });
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(finishResumeUpload("resume-a", true)).resolves.toEqual({ ok: true, approved: true });
    expect(logger).toHaveBeenCalledWith("resume_evidence_bootstrap_failed", expect.any(String));
    expect(JSON.stringify(logger.mock.calls)).not.toContain("temporary bootstrap failure");
  });

  it("bootstraps only the owned approved profile after manual approval", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const query = {} as {
      eq: () => typeof query;
      is: () => typeof query;
      maybeSingle: () => Promise<{ data: { candidate_profile_id: string }; error: null }>;
    };
    query.eq = () => query;
    query.is = () => query;
    query.maybeSingle = async () => ({ data: { candidate_profile_id: profileId }, error: null });
    mocks.from.mockReturnValue({ select: () => query });
    mocks.redirect.mockImplementation((destination: string) => { throw new Error(`REDIRECT:${destination}`); });
    const form = new FormData();
    form.set("id", "resume-a");

    await expect(approveResume(form)).rejects.toThrow("REDIRECT:/resumes?message=CV%20aprobado");
    expect(mocks.bootstrap).toHaveBeenCalledWith(expect.anything(), "user-a", profileId);
  });

  it("keeps the explicit decision when another usable CV exists", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id: "resume-a", candidate_profile_id: profileId }], error: null });
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            in: () => ({
              is: () => ({ neq: () => Promise.resolve({ data: [{ id: "resume-b" }], error: null }) }),
            }),
          }),
        }),
      }),
    });

    await expect(finishResumeUpload("resume-a", true)).resolves.toEqual({ ok: true, approved: false });
    expect(mocks.rpc).not.toHaveBeenCalledWith("approve_resume", expect.anything());
  });
});
