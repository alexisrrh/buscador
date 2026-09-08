import { createHash } from "node:crypto";
import { requireUser } from "@/lib/supabase/server";
import { createApplicationServiceClient } from "@/lib/applications/repository.server";
import { DERIVED_BUCKET } from "@/lib/derived-resumes/content";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireUser();
  if (!user) return new Response("Autenticación requerida", { status: 401 });
  const { id } = await params;
  const { data: record } = await supabase.from("derived_resumes").select("storage_path,mime_type,sha256,size_bytes")
    .eq("id", id).eq("user_id", user.id).in("status", ["READY", "ARCHIVED"]).maybeSingle();
  if (!record) return new Response("Archivo no disponible", { status: 404 });
  try {
    const { data, error } = await createApplicationServiceClient().storage.from(DERIVED_BUCKET).download(record.storage_path);
    if (error || !data) throw new Error();
    const bytes = await data.arrayBuffer();
    if (bytes.byteLength !== record.size_bytes || createHash("sha256").update(Buffer.from(bytes)).digest("hex") !== record.sha256) throw new Error();
    return new Response(bytes, { headers: {
      "Content-Type": record.mime_type,
      "Content-Disposition": `${new URL(request.url).searchParams.has("download") ? "attachment" : "inline"}; filename="resume.pdf"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch { return new Response("No se pudo descargar el archivo", { status: 503 }); }
}
