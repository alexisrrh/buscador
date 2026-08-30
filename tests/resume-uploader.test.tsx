import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResumeUploader } from "@/components/resume-uploader";
import { MAX_RESUME_BYTES } from "@/lib/validation";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  finish: vi.fn(),
  reject: vi.fn(),
  upload: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/actions/resumes", () => ({
  prepareResumeUpload: mocks.prepare,
  finishResumeUpload: mocks.finish,
  rejectResumeUpload: mocks.reject,
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    storage: {
      from: () => ({ upload: mocks.upload }),
    },
  }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

vi.mock("@/lib/validation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/validation")>();
  return { ...actual, sha256Hex: vi.fn().mockResolvedValue("a".repeat(64)) };
});

const profiles = [{
  id: "profile-a", user_id: "user-a", name: "Frontend", headline: null,
  job_family: null, seniority: null, created_at: "", updated_at: "", deleted_at: null,
}];

describe("Resume upload coordinator", () => {
  function submitForm() {
    const form = screen.getByRole("heading", { name: "Sube tu CV" }).closest("form");
    if (!form) throw new Error("Upload form not found");
    fireEvent.submit(form);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepare.mockResolvedValue({
      resume: {
        id: "resume-a", user_id: "user-a", candidate_profile_id: "profile-a",
        version: 2, status: "PROCESSING", original_filename: "resume.pdf",
        storage_bucket: "private-resumes",
        storage_path: "user-a/profile-a/resume-a/v2/resume.pdf",
        mime_type: "application/pdf", file_size_bytes: 100,
        content_sha256: "a".repeat(64), created_at: "", approved_at: null,
        archived_at: null, deleted_at: null,
      },
    });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.finish.mockResolvedValue({ ok: true });
    mocks.reject.mockResolvedValue({ ok: true });
  });

  it("uploads a valid file to the generated private path and finalizes READY", async () => {
    const user = userEvent.setup();
    render(<ResumeUploader profiles={profiles} />);
    const file = new File(["synthetic"], "resume.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Selecciona tu CV"), file);
    submitForm();

    expect(await screen.findByText(/versión 2 subido/i)).toBeInTheDocument();
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({
      candidateProfileId: "profile-a",
      contentSha256: "a".repeat(64),
    }));
    expect(mocks.upload).toHaveBeenCalledWith(
      "user-a/profile-a/resume-a/v2/resume.pdf",
      file,
      expect.objectContaining({
        contentType: "application/pdf",
        upsert: false,
        metadata: { contentSha256: "a".repeat(64) },
      }),
    );
    expect(mocks.finish).toHaveBeenCalledWith("resume-a");
    expect(mocks.reject).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("marks metadata REJECTED when immutable object upload fails", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "internal storage detail" } });
    const user = userEvent.setup();
    render(<ResumeUploader profiles={profiles} />);
    const file = new File(["synthetic"], "resume.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Selecciona tu CV"), file);
    submitForm();

    expect(await screen.findByRole("alert")).toHaveTextContent(/No se pudo subir el archivo/);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/internal storage detail/);
    expect(mocks.reject).toHaveBeenCalledWith("resume-a");
    expect(mocks.finish).not.toHaveBeenCalled();
  });

  it("rejects invalid MIME before metadata creation", async () => {
    render(<ResumeUploader profiles={profiles} />);
    const file = new File(["synthetic"], "resume.txt", { type: "text/plain" });
    const input = screen.getByLabelText("Selecciona tu CV") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    submitForm();
    expect(await screen.findByRole("alert")).toHaveTextContent(/PDF o DOCX/);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("rejects files over 10 MiB before metadata creation", async () => {
    render(<ResumeUploader profiles={profiles} />);
    const file = new File(["synthetic"], "resume.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: MAX_RESUME_BYTES + 1 });
    fireEvent.change(screen.getByLabelText("Selecciona tu CV"), { target: { files: [file] } });
    submitForm();
    expect(await screen.findByRole("alert")).toHaveTextContent(/10 MiB/);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
});
