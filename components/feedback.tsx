export function Feedback({ message, error }: { message?: string; error?: string }) {
  if (error) return <p className="alert error" role="alert">{error}</p>;
  if (message) return <p className="alert" role="status">{message}</p>;
  return null;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>;
}
