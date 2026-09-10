"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { finishResumeUpload, prepareContextualResumeUpload, prepareResumeUpload, rejectResumeUpload } from "@/app/actions/resumes";
import { createClient } from "@/lib/supabase/browser";
import { sha256Hex, validateResumeFile } from "@/lib/validation";
type ResumeProfile = { id: string; name: string };

export function ResumeUploader({ profiles, contextual = false }: { profiles: ResumeProfile[]; contextual?: boolean }) {
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
      const finalized = await finishResumeUpload(resume.id);
      if (finalized.error) throw new Error("El archivo subió, pero su estado quedó PROCESSING. Recarga para revisarlo.");
      formRef.current?.reset(); setFeedback({ message: `CV versión ${resume.version} subido correctamente.` }); router.refresh();
    } catch (error) {
      setFeedback({ error: error instanceof Error ? error.message : "No se pudo completar la subida." });
    } finally { setBusy(false); }
  }

  const singleProfile = profiles.length === 1 ? profiles[0] : null;
  return <form ref={formRef} onSubmit={upload} className="card stack"><h2>Sube tu CV</h2><p className="muted">Guardaremos cada archivo como una versión nueva y privada.</p>{feedback.error && <p className="alert error" role="alert">{feedback.error}</p>}{feedback.message && <p className="alert" role="status">{feedback.message}</p>}<div className="form-grid">{contextual && singleProfile ? <input type="hidden" name="candidate_profile_id" value={singleProfile.id} /> : contextual && profiles.length === 0 ? null : <div className="field"><label htmlFor="resume-profile">{contextual ? "Este CV corresponde a" : "¿Para qué perfil profesional es este CV?"}</label><select id="resume-profile" name="candidate_profile_id" required={!contextual || profiles.length > 1}>{contextual && profiles.length > 1 && <option value="">Elige una trayectoria</option>}{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></div>}<div className="field"><label htmlFor="resume-file">Selecciona tu CV</label><input className="file-input" id="resume-file" name="file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required /><span className="hint">Puede ser PDF o Word y ocupar hasta 10 MiB. Lo verificaremos antes de guardarlo.</span></div></div><div className="actions"><button disabled={busy} type="submit">{busy ? "Guardando…" : contextual ? "Preparar este CV" : "Guardar este CV"}</button></div></form>;
}
