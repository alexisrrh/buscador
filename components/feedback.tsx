export function Feedback({ message, error }: { message?: string; error?: string }) {
  if (error) return <p className="alert error" role="alert">{error}</p>;
  if (message) return <p className="alert" role="status">{message}</p>;
  return null;
}

export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    ACTIVE: "Activa",
    APPROVED: "Aprobado",
    READY: "Listo para usar",
    PAUSED: "En pausa",
    PROCESSING: "Guardando",
    DRAFT: "Borrador",
    ARCHIVED: "Archivado",
    REJECTED: "No se pudo guardar",
    DISABLED: "Desactivada",
  };
  return <span className={`badge ${status}`}>{labels[status] ?? status}</span>;
}
