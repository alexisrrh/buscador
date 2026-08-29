"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { finishResumeUpload, prepareResumeUpload } from "@/app/actions/resumes";
import { createClient } from "@/lib/supabase/browser";
import { sha256Hex, validateResumeFile } from "@/lib/validation";
import type { CandidateProfile } from "@/lib/types";

export function ResumeUploader({ profiles }: { profiles: CandidateProfile[] }) {
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
      const prepared = await prepareResumeUpload({ candidateProfileId, originalFilename: file.name, mimeType: file.type, fileSizeBytes: file.size, contentSha256 });
      if ("error" in prepared) throw new Error(prepared.error);
      const resume = prepared.resume; const supabase = createClient();
      await supabase.storage.from(resume.storage_bucket).remove([resume.storage_path]);
      const { error: uploadError } = await supabase.storage.from(resume.storage_bucket).upload(resume.storage_path, file, { contentType: file.type, upsert: false });
      if (uploadError) { await finishResumeUpload(resume.id, false); throw new Error(`No se pudo subir el archivo: ${uploadError.message}`); }
      const finalized = await finishResumeUpload(resume.id, true);
      if (finalized.error) throw new Error("El archivo subió, pero su estado quedó PROCESSING. Recarga para revisarlo.");
      formRef.current?.reset(); setFeedback({ message: `CV versión ${resume.version} subido correctamente.` }); router.refresh();
    } catch (error) {
      setFeedback({ error: error instanceof Error ? error.message : "No se pudo completar la subida." });
    } finally { setBusy(false); }
  }

  return <form ref={formRef} onSubmit={upload} className="card stack"><h2>Subir nueva versión</h2>{feedback.error && <p className="alert error" role="alert">{feedback.error}</p>}{feedback.message && <p className="alert" role="status">{feedback.message}</p>}<div className="form-grid"><div className="field"><label htmlFor="resume-profile">Perfil profesional</label><select id="resume-profile" name="candidate_profile_id" required>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></div><div className="field"><label htmlFor="resume-file">Archivo PDF o DOCX</label><input className="file-input" id="resume-file" name="file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required /><span className="hint">Máximo 10 MiB. SHA-256 se calcula localmente.</span></div></div><div className="actions"><button disabled={busy} type="submit">{busy ? "Subiendo…" : "Subir CV"}</button></div></form>;
}
