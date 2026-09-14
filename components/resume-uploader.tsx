"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { finishResumeUpload, prepareContextualResumeUpload, prepareResumeUpload, rejectResumeUpload } from "@/app/actions/resumes";
import { createClient } from "@/lib/supabase/browser";
import { sha256Hex, validateResumeFile } from "@/lib/validation";
type ResumeProfile = { id: string; name: string };
type ResumeUploaderProps = {
  profiles: ResumeProfile[];
  contextual?: boolean;
  autoApproveFirst?: boolean;
  heading?: string;
  description?: string;
  submitLabel?: string;
};

export function ResumeUploader({
  profiles,
  contextual = false,
  autoApproveFirst = false,
  heading = "Sube tu CV",
  description = "PDF o Word · privado y protegido",
  submitLabel = contextual ? "Subir mi CV" : "Guardar este CV",
}: ResumeUploaderProps) {
  const router = useRouter(); const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false); const [feedback, setFeedback] = useState<{ error?: string; message?: string }>({});

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFeedback({});
    const fileInput = event.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
    const profileInput = event.currentTarget.elements.namedItem("candidate_profile_id") as HTMLSelectElement | null;
    const file = fileInput?.files?.[0]; const candidateProfileId = profileInput?.value ?? "";
    if (!file) { setFeedback({ error: "Selecciona un archivo." }); setBusy(false); return; }
    const validationError = validateResumeFile(file);
    if (validationError) { setFeedback({ error: validationError }); setBusy(false); return; }
    try {
      const contentSha256 = await sha256Hex(file);
      const prepared = contextual
        ? await prepareContextualResumeUpload({ candidateProfileId: candidateProfileId || undefined, originalFilename: file.name, mimeType: file.type, fileSizeBytes: file.size, contentSha256 })
        : await prepareResumeUpload({ candidateProfileId, originalFilename: file.name, mimeType: file.type, fileSizeBytes: file.size, contentSha256 });
      if ("error" in prepared) throw new Error(prepared.error);
      const resume = prepared.resume; const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from(resume.storage_bucket).upload(resume.storage_path, file, {
        contentType: file.type,
        upsert: false,
        metadata: { contentSha256 },
      });
      if (uploadError) { await rejectResumeUpload(resume.id); throw new Error("No se pudo subir el archivo. Inténtalo de nuevo."); }
      const finalized = autoApproveFirst ? await finishResumeUpload(resume.id, true) : await finishResumeUpload(resume.id);
      if (finalized.error) throw new Error("No se pudo comprobar el CV subido. Inténtalo de nuevo.");
      formRef.current?.reset(); setFeedback({ message: finalized.approved ? "CV listo." : "CV subido correctamente." }); router.refresh();
    } catch (error) {
      setFeedback({ error: error instanceof Error ? error.message : "No se pudo completar la subida." });
    } finally { setBusy(false); }
  }

  const singleProfile = profiles.length === 1 ? profiles[0] : null;
  return <form ref={formRef} onSubmit={upload} className="card stack resume-onboarding-upload">
    <h2>{heading}</h2><p className="muted">{description}</p>
    {feedback.error && <p className="alert error" role="alert">{feedback.error}</p>}
    {feedback.message && <p className="alert" role="status">{feedback.message}</p>}
    <div className="form-grid">
      {contextual && singleProfile ? <input type="hidden" name="candidate_profile_id" value={singleProfile.id} /> : contextual && profiles.length === 0 ? null : <div className="field"><label htmlFor="resume-profile">Este CV corresponde a</label><select id="resume-profile" name="candidate_profile_id" required={!contextual || profiles.length > 1}>{contextual && profiles.length > 1 && <option value="">Elige una trayectoria</option>}{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></div>}
      <div className="field"><label htmlFor="resume-file">Selecciona tu CV</label><input className="file-input" id="resume-file" name="file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required /><span className="hint">PDF o Word · privado y protegido</span></div>
    </div>
    <div className="actions"><button disabled={busy} type="submit">{busy ? "Comprobando tu CV…" : submitLabel}</button></div>
  </form>;
}
