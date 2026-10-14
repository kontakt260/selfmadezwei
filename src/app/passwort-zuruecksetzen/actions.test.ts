import { describe, it, expect, vi, beforeEach } from "vitest";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resetPasswordAction } from "./actions";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const updateUserMock = vi.fn();

function form(password: string, confirmPassword = password): FormData {
  const data = new FormData();
  data.set("password", password);
  data.set("confirmPassword", confirmPassword);
  return data;
}

beforeEach(() => {
  updateUserMock.mockReset();
  vi.mocked(redirect).mockReset();
  vi.mocked(createClient).mockResolvedValue({
    auth: { updateUser: updateUserMock },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
});

describe("resetPasswordAction", () => {
  it("saves the password, marks the account and redirects home", async () => {
    updateUserMock.mockResolvedValue({ error: null });
    await resetPasswordAction({}, form("neues-passwort"));
    expect(updateUserMock).toHaveBeenCalledWith({
      password: "neues-passwort",
      data: { has_password: true },
    });
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("asks for a different password when it equals the current one", async () => {
    updateUserMock.mockResolvedValue({
      error: { code: "same_password", message: "New password should be different from the old password." },
    });
    const res = await resetPasswordAction({}, form("altes-passwort"));
    expect(res.fieldErrors?.password).toMatch(/verwenden Sie bereits/);
    expect(res.error).toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("asks for a stronger password when Supabase rejects it as weak", async () => {
    updateUserMock.mockResolvedValue({
      error: { code: "weak_password", message: "Password is known to be weak." },
    });
    const res = await resetPasswordAction({}, form("passwort123"));
    expect(res.fieldErrors?.password).toMatch(/zu unsicher/);
    expect(res.error).toBeUndefined();
  });

  it("reports an invalid link for other errors, e.g. a missing session", async () => {
    updateUserMock.mockResolvedValue({
      error: { code: "session_not_found", message: "Auth session missing!" },
    });
    const res = await resetPasswordAction({}, form("neues-passwort"));
    expect(res.error).toMatch(/Link ungültig oder abgelaufen/);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not call Supabase when the passwords do not match", async () => {
    const res = await resetPasswordAction({}, form("neues-passwort", "anderes-passwort"));
    expect(res.fieldErrors?.confirmPassword).toMatch(/stimmen nicht überein/);
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});
