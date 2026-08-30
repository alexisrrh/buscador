const TRACKING_PARAMETERS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
]);

function normalizeText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeCompanyName(name: string) {
  return normalizeText(name);
}

export function normalizeJobTitle(title: string) {
  return normalizeText(title);
}

export function canonicalizeJobUrl(value: string) {
  const url = new URL(value.trim());

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Job URL must use HTTP or HTTPS.");
  }

  const trackingKeys = [...url.searchParams.keys()].filter((key) =>
    TRACKING_PARAMETERS.has(key.toLowerCase()),
  );
  for (const key of trackingKeys) url.searchParams.delete(key);

  url.searchParams.sort();
  return url.toString();
}

export async function generateDescriptionHash(description: string) {
  const bytes = new TextEncoder().encode(description);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
