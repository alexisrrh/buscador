import Link from "next/link";
import { transitionSearchStatus } from "@/app/actions/searches";
import type { SearchStatus } from "@/lib/types";

export function SearchStatusActions({
  id,
  status,
  editHref,
  editLabel = "Editar",
  includeArchive = false,
}: {
  id: string;
  status: SearchStatus;
  editHref: string;
  editLabel?: string;
  includeArchive?: boolean;
}) {
  return (
    <div className="actions search-status-actions">
      {status === "DRAFT" && <>
        <Link className="button secondary" href={editHref}>{editLabel}</Link>
        <TransitionForm id={id} status="ACTIVE" label="Activar búsqueda" />
      </>}
      {status === "ACTIVE" && <>
        <Link className="button secondary" href={editHref}>Editar</Link>
        <TransitionForm id={id} status="PAUSED" label="Pausar" secondary />
      </>}
      {status === "PAUSED" && <>
        <Link className="button secondary" href={editHref}>Editar</Link>
        <TransitionForm id={id} status="ACTIVE" label="Reactivar" />
      </>}
      {includeArchive && ["DRAFT", "ACTIVE", "PAUSED"].includes(status) && (
        <TransitionForm id={id} status="ARCHIVED" label="Archivar" danger />
      )}
    </div>
  );
}

function TransitionForm({ id, status, label, secondary = false, danger = false }: {
  id: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  label: string;
  secondary?: boolean;
  danger?: boolean;
}) {
  const className = danger ? "danger" : secondary ? "secondary" : undefined;
  return (
    <form action={transitionSearchStatus} className="search-transition-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={className} type="submit">{label}</button>
    </form>
  );
}
