import { describe, expect, it } from "vitest";
import { captchaTokenFrom, isCaptchaError } from "./captcha";

function form(value?: string) {
  const data = new FormData();
  if (value !== undefined) data.set("cf-turnstile-response", value);
  return data;
}

describe("captchaTokenFrom", () => {
  it("reads the token of the widget", () => {
    expect(captchaTokenFrom(form(" token-1 "))).toBe("token-1");
  });

  it("returns nothing for a missing, empty or oversized token", () => {
    expect(captchaTokenFrom(form())).toBeUndefined();
    expect(captchaTokenFrom(form("   "))).toBeUndefined();
    expect(captchaTokenFrom(form("x".repeat(4097)))).toBeUndefined();
  });
});

describe("isCaptchaError", () => {
  it("recognizes only the CAPTCHA error of Supabase", () => {
    expect(isCaptchaError({ code: "captcha_failed" })).toBe(true);
    expect(isCaptchaError({ code: "invalid_credentials" })).toBe(false);
    expect(isCaptchaError(null)).toBe(false);
  });
});
