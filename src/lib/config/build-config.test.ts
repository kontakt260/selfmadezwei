import { describe, expect, it, vi } from "vitest";
import {
  assertBuildConfig,
  checkBuildConfig,
  detectBuildEnvironment,
  REQUIRED_VARIABLES,
  type BuildEnv,
} from "./build-config";

const complete: BuildEnv = Object.fromEntries(
  REQUIRED_VARIABLES.map((name) => [name, `wert-${name}`]),
);

const stage: BuildEnv = {
  ...complete,
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "stage",
  NEXT_PUBLIC_SITE_URL: "https://stage-app.narravit.de",
  STRIPE_SECRET_KEY: "sk_test_abc",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  EMAIL_TEST_RECIPIENT: "test@example.test",
  RATE_LIMIT_DISABLED: "true",
  WELCOME_DISCOUNT_CODE: "CODE",
};

const customer: BuildEnv = {
  ...complete,
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: "main",
  NEXT_PUBLIC_SITE_URL: "https://app.narravit.de",
  STRIPE_SECRET_KEY: "sk_live_abc",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAAreal",
  WELCOME_DISCOUNT_CODE: "CODE",
};

describe("detectBuildEnvironment", () => {
  it("recognizes stage, local and the customer environment", () => {
    expect(detectBuildEnvironment(stage)).toBe("stage");
    expect(detectBuildEnvironment({})).toBe("local");
    expect(detectBuildEnvironment(customer)).toBe("customer");
  });

  it.each([
    ["branch main", { VERCEL: "1", VERCEL_GIT_COMMIT_REF: "main" }],
    ["Vercel production", { VERCEL: "1", VERCEL_ENV: "production" }],
    ["customer address", { NEXT_PUBLIC_SITE_URL: "https://app.narravit.de/" }],
  ])("treats %s as customer environment", (_label, env) => {
    expect(detectBuildEnvironment(env)).toBe("customer");
  });

  it("ignores NODE_ENV, it is production on stage too", () => {
    expect(detectBuildEnvironment({ ...stage, NODE_ENV: "production" })).toBe("stage");
  });
});

describe("checkBuildConfig", () => {
  it("accepts a complete stage with test keys and test switches", () => {
    expect(checkBuildConfig(stage).errors).toEqual([]);
  });

  it("accepts a complete customer environment", () => {
    expect(checkBuildConfig(customer)).toEqual({
      environment: "customer",
      errors: [],
      warnings: [],
    });
  });

  it.each(REQUIRED_VARIABLES)("stops the stage build without %s", (name) => {
    const { errors } = checkBuildConfig({ ...stage, [name]: "" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(name);
  });

  it("names the seven values production lacks today", () => {
    const missing = [
      "CRON_SECRET",
      "RESEND_API_KEY",
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_ID_INITIAL",
      "STRIPE_PRICE_ID_RENEWAL",
    ];
    const env = { ...customer, ...Object.fromEntries(missing.map((name) => [name, undefined])) };
    const [message] = checkBuildConfig(env).errors;
    for (const name of missing) expect(message).toContain(name);
  });

  it("only warns locally about missing values", () => {
    const result = checkBuildConfig({});
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it("treats blank values as missing", () => {
    expect(checkBuildConfig({ ...stage, CRON_SECRET: "   " }).errors[0]).toContain("CRON_SECRET");
  });

  it("requires the customer address on main", () => {
    const { errors } = checkBuildConfig({
      ...customer,
      NEXT_PUBLIC_SITE_URL: "https://stage-app.narravit.de",
    });
    expect(errors[0]).toContain("https://app.narravit.de");
  });

  it("rejects a Stripe test key for customers and accepts restricted live keys", () => {
    expect(checkBuildConfig({ ...customer, STRIPE_SECRET_KEY: "sk_test_abc" }).errors[0]).toContain(
      "Live-Schlüssel",
    );
    expect(checkBuildConfig({ ...customer, STRIPE_SECRET_KEY: "rk_live_abc" }).errors).toEqual([]);
  });

  it.each(["1x00000000000000000000AA", "2x00000000000000000000AB", "3x00000000000000000000FF"])(
    "rejects the Turnstile test key %s for customers",
    (key) => {
      const { errors } = checkBuildConfig({ ...customer, NEXT_PUBLIC_TURNSTILE_SITE_KEY: key });
      expect(errors[0]).toContain("Testschlüssel");
    },
  );

  it.each(["EMAIL_TEST_RECIPIENT", "RATE_LIMIT_DISABLED"])(
    "rejects the test switch %s for customers",
    (name) => {
      expect(checkBuildConfig({ ...customer, [name]: "x" }).errors[0]).toContain(name);
    },
  );

  it("only warns about a missing discount code", () => {
    for (const env of [stage, customer]) {
      const result = checkBuildConfig({ ...env, WELCOME_DISCOUNT_CODE: "" });
      expect(result.errors).toEqual([]);
      expect(result.warnings[0]).toContain("WELCOME_DISCOUNT_CODE");
    }
    expect(checkBuildConfig({ ...complete }).warnings).toEqual([]);
  });

  it("never repeats a secret value in a message", () => {
    const secret = "sk_test_GEHEIM123";
    const result = checkBuildConfig({
      ...customer,
      STRIPE_SECRET_KEY: secret,
      EMAIL_TEST_RECIPIENT: "geheim@example.test",
    });
    const text = [...result.errors, ...result.warnings].join(" ");
    expect(text).not.toContain(secret);
    expect(text).not.toContain("geheim@example.test");
  });
});

describe("assertBuildConfig", () => {
  it("stops the build and lists every problem", () => {
    expect(() =>
      assertBuildConfig({ ...customer, STRIPE_SECRET_KEY: "sk_test_abc", CRON_SECRET: "" }),
    ).toThrow(/CRON_SECRET[\s\S]*Live-Schlüssel/);
  });

  it("lets a valid build pass and prints warnings", () => {
    const warn = vi.fn();
    assertBuildConfig({ ...stage, WELCOME_DISCOUNT_CODE: "" }, warn);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
