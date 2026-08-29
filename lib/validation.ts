export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export const RESUME_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export function trimmed(value: FormDataEntryValue | null, max = 255) {
  return String(value ?? "").trim().slice(0, max);
}

export function listFromInput(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function nullableNumber(value: FormDataEntryValue | null) {
  const text = trimmed(value);
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error("Debe ser un número válido.");
  return number;
}

export function requiredInteger(value: FormDataEntryValue | null, label: string) {
  const number = Number(trimmed(value));
  if (!Number.isInteger(number)) throw new Error(`${label} debe ser un entero.`);
  return number;
}

export function validateScores(notification: number, semi: number, auto: number) {
  if (
    notification < 0 ||
    notification > semi ||
    semi > auto ||
    auto > 100
  ) {
    throw new Error("Los scores deben cumplir 0 ≤ notificación ≤ semi ≤ auto ≤ 100.");
  }
}

export const SEARCH_SCHEDULES = {
  HOURLY: { frequency_type: "INTERVAL", frequency_value: { minutes: 60 } },
  EVERY_3_HOURS: { frequency_type: "INTERVAL", frequency_value: { minutes: 180 } },
  EVERY_6_HOURS: { frequency_type: "INTERVAL", frequency_value: { minutes: 360 } },
  DAILY: { frequency_type: "DAILY", frequency_value: { time: "09:00" } },
  WEEKDAYS: {
    frequency_type: "WEEKDAYS",
    frequency_value: { time: "09:00", days: [1, 2, 3, 4, 5] },
  },
} as const;

export function scheduleFromPreset(preset: string) {
  return SEARCH_SCHEDULES[preset as keyof typeof SEARCH_SCHEDULES] ?? SEARCH_SCHEDULES.DAILY;
}

export function validateResumeFile(file: Pick<File, "name" | "type" | "size">) {
  const extension = file.name.toLowerCase().split(".").pop();
  const extensionValid = extension === "pdf" || extension === "docx";
  const mimeValid = RESUME_MIME_TYPES.includes(
    file.type as (typeof RESUME_MIME_TYPES)[number],
  );

  if (!extensionValid || !mimeValid) return "Solo se admiten archivos PDF o DOCX.";
  if (file.size <= 0) return "El archivo está vacío.";
  if (file.size > MAX_RESUME_BYTES) return "El archivo supera el límite de 10 MiB.";
  if (file.name.includes("/") || file.name.includes("\\")) return "Nombre de archivo inválido.";
  return null;
}

export async function sha256Hex(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
