import { describe, it, expect } from "vitest";
import { hasPasswordLogin } from "./has-password";

describe("hasPasswordLogin", () => {
  it("is true for accounts registered with e-mail and password", () => {
    expect(hasPasswordLogin({ app_metadata: { provider: "email", providers: ["email"] } })).toBe(true);
  });

  it("is true when no provider information is present (legacy default)", () => {
    expect(hasPasswordLogin({ app_metadata: {} })).toBe(true);
    expect(hasPasswordLogin({})).toBe(true);
  });

  it("is false for a Google account that never set a password", () => {
    expect(
      hasPasswordLogin({
        app_metadata: { provider: "google", providers: ["google"] },
        user_metadata: {},
      }),
    ).toBe(false);
  });

  it("is true for a Google account after the reset form set the marker", () => {
    expect(
      hasPasswordLogin({
        app_metadata: { provider: "google", providers: ["google"] },
        user_metadata: { has_password: true },
      }),
    ).toBe(true);
  });

  it("is true when e-mail is among the linked sign-in methods", () => {
    expect(
      hasPasswordLogin({ app_metadata: { provider: "facebook", providers: ["facebook", "email"] } }),
    ).toBe(true);
  });

  it("ignores marker values that are not exactly true", () => {
    expect(
      hasPasswordLogin({
        app_metadata: { provider: "google", providers: ["google"] },
        user_metadata: { has_password: "yes" },
      }),
    ).toBe(false);
  });
});
