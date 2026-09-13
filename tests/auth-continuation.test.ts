import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signInWithPassword: mocks.signInWithPassword, signUp: mocks.signUp } })),
}));

import { login, register } from "@/app/actions/auth";

function preparationForm() {
  const form = new FormData();
  form.set("email", "candidate@example.test");
  form.set("password", "password-123");
  form.set("intent_role", "Frontend Developer");
  form.set("intent_location", "España");
  form.set("intent_mode", "REMOTE");
  form.set("return_to", "/resumes?intent_role=Frontend+Developer&intent_mode=REMOTE&offer_title=Frontend+Engineer&offer_url=https%3A%2F%2Fjobs.example.test%2Ffrontend&action=prepare");
  return form;
}

describe("auth preparation continuity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
  });

  it("keeps a safe preparation return target after login", async () => {
    await expect(login(preparationForm())).rejects.toThrow(/REDIRECT:\/resumes\?.*action=prepare/);
  });

  it("keeps the contextual target through email confirmation", async () => {
    await expect(register(preparationForm())).rejects.toThrow(/REDIRECT:\/login\?.*return_to=/);
    expect(mocks.redirect).toHaveBeenCalledWith(expect.stringContaining("action%3Dprepare"));
  });

  it("shows a friendly message for Supabase email-send rate limits while preserving continuation", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: { code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" } });
    await expect(register(preparationForm())).rejects.toThrow(/REDIRECT:\/register\?error=Has%20intentado%20crear%20varias%20cuentas/);
    expect(mocks.redirect).toHaveBeenCalledWith(expect.stringContaining("action%3Dprepare"));
  });

  it("keeps the generic message for unrelated Auth errors", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: { code: "unexpected_auth_error", status: 400, message: "Unexpected failure" } });
    await expect(register(preparationForm())).rejects.toThrow(/REDIRECT:\/register\?error=No%20se%20pudo%20crear%20la%20cuenta/);
  });

  it("continues directly to the preserved target when signUp returns a session", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: "synthetic" } }, error: null });
    await expect(register(preparationForm())).rejects.toThrow(/REDIRECT:\/resumes\?.*action=prepare/);
    expect(mocks.signUp).toHaveBeenCalledWith({ email: "candidate@example.test", password: "password-123" });
  });

  it("rejects an unsafe return target", async () => {
    const form = preparationForm();
    form.set("return_to", "https://attacker.example/steal");
    await expect(login(form)).rejects.toThrow("REDIRECT:/oportunidades?");
  });
});
