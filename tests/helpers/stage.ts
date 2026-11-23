import { expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { readEnvLocal, STAGE_HOST } from "./server-env.mjs";

export { readEnvLocal, STAGE_HOST };

// PROJ-31: Gemeinsame Hilfen der E2E-Suites, die auf Stage eigene Testdaten anlegen.

/** Bricht ab, wenn die lokale Umgebung nicht auf die Stage-Datenbank zeigt. */
export function assertStage(env: Record<string, string> = readEnvLocal()): void {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    // Unten als fehlende Stage-Adresse behandelt.
  }
  if (host !== STAGE_HOST) {
    throw new Error("Die E2E-Tests laufen nur gegen die Stage-Datenbank.");
  }
}

/** Passwort des QA-Kontos. Es steht nur in `.env.local`, nie im Repo. */
export function qaPassword(env: Record<string, string> = readEnvLocal()): string {
  const password = env.E2E_QA_PASSWORD;
  if (!password) throw new Error("E2E_QA_PASSWORD fehlt in .env.local.");
  return password;
}

export type TestAccount = { id: string; email: string; password: string; name: string };

export async function createTestAccount(
  admin: SupabaseClient,
  input: { email: string; name: string },
): Promise<TestAccount> {
  const password = `${crypto.randomBytes(18).toString("base64url")}aA1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: input.name },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return { id: data.user.id, email: input.email, password, name: input.name };
}

export async function signIn(
  page: Page,
  account: { email: string; password: string },
  target = "/anmelden",
): Promise<void> {
  await page.goto(target);
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)
              ?.value.length ?? 0,
        ),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes("/anmelden"), { timeout: 45_000 });
}

/** Liest das Zugriffstoken aus den Supabase-Cookies eines Browser-Kontexts. */
export function accessToken(cookies: Array<{ name: string; value: string }>): string {
  const parts = cookies
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((cookie) => cookie.value)
    .join("");
  const raw = parts.startsWith("base64-")
    ? Buffer.from(parts.slice("base64-".length), "base64url").toString("utf8")
    : decodeURIComponent(parts);
  return (JSON.parse(raw) as { access_token: string }).access_token;
}

/** Direkter REST-Aufruf an Supabase, um RLS mit echten Tokens zu prüfen. */
export function restRequest(
  connection: { supabaseUrl: string; anonKey: string; prefer?: string },
  pathname: string,
  init: RequestInit,
  token?: string,
): Promise<Response> {
  return fetch(`${connection.supabaseUrl}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: connection.anonKey,
      Authorization: `Bearer ${token ?? connection.anonKey}`,
      "Content-Type": "application/json",
      Prefer: connection.prefer ?? "return=minimal",
      ...(init.headers ?? {}),
    },
  });
}

export async function storageFileExists(
  admin: SupabaseClient,
  bucket: string,
  file: string,
): Promise<boolean> {
  const folder = file.slice(0, file.lastIndexOf("/"));
  const name = file.slice(file.lastIndexOf("/") + 1);
  const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100 });
  if (error) throw new Error(error.message);
  return (data ?? []).some((entry) => entry.name === name);
}
