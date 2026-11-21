import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import { GET } from "./route";
import { CLAIM_LINK_COOKIE, generateClaimToken } from "@/lib/purchases/claim-token";

const call = (query: string) => GET(new NextRequest(`https://app.test/kauf-zuordnen${query}`));

describe("/kauf-zuordnen — Link aus der Kauf-Mail", () => {
  it("legt das Geheimnis als httpOnly-Cookie ab und leitet ohne Geheimnis in der URL weiter", async () => {
    const code = generateClaimToken();
    const res = await call(`?code=${code}&ziel=anmelden`);
    const location = res.headers.get("location")!;
    expect(location).toBe("https://app.test/anmelden?next=%2Fkauf-einloesen");
    expect(location).not.toContain(code);
    const cookie = res.cookies.get(CLAIM_LINK_COOKIE);
    expect(cookie?.value).toBe(code);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/kauf-einloesen");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("führt standardmäßig zur Registrierung", async () => {
    const res = await call(`?code=${generateClaimToken()}`);
    expect(res.headers.get("location")).toBe("https://app.test/registrieren?next=%2Fkauf-einloesen");
  });

  it("legt bei kaputtem Code kein Cookie an", async () => {
    const res = await call("?code=kaputt");
    expect(res.cookies.get(CLAIM_LINK_COOKIE)).toBeUndefined();
    expect(res.status).toBe(307);
  });

  it("akzeptiert kein fremdes Weiterleitungsziel", async () => {
    const res = await call(`?code=${generateClaimToken()}&ziel=https://boese.example`);
    expect(res.headers.get("location")).toBe("https://app.test/registrieren?next=%2Fkauf-einloesen");
  });
});
