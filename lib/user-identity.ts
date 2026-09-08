export type UserIdentityInput = {
  first_name?: unknown;
  last_name?: unknown;
};

export type StructuredUserIdentity = {
  first_name: string;
  last_name: string;
};

export function normalizeIdentityPart(value: unknown, maxLength = 80) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function structuredUserIdentity(input: UserIdentityInput | null | undefined): StructuredUserIdentity | null {
  const first_name = normalizeIdentityPart(input?.first_name);
  const last_name = normalizeIdentityPart(input?.last_name);
  if (!first_name || !last_name) return null;
  const fullName = `${first_name} ${last_name}`;
  return isPersonalName(fullName) ? { first_name, last_name } : null;
}

export function isPersonalName(value: string) {
  const candidate = normalizeIdentityPart(value, 240);
  if (!/^[a-záéíóúüñ]+(?:[ -][a-záéíóúüñ]+){1,4}$/i.test(candidate)) return false;
  return !/\b(developer|desarrollador|frontend|backend|full\s*stack|web|software|engineer|ingenier[oa]|react|node)\b/i.test(candidate);
}
