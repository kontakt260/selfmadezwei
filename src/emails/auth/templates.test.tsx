// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { ConfirmSignupTemplate } from "./ConfirmSignupTemplate";
import { ResetPasswordTemplate } from "./ResetPasswordTemplate";

// Die Supabase-Auth-Vorlagen liegen als statisches HTML in
// `supabase/templates/` (zum Einfügen im Supabase-Dashboard). Dieser Test
// stellt sicher, dass die Dateien zum React-Quelltext passen.
//
// Dateien neu erzeugen:  UPDATE_AUTH_TEMPLATES=1 npx vitest run src/emails/auth

const templates: Array<{
  file: string;
  element: ReactElement;
  linkType: "email" | "recovery";
}> = [
  { file: "confirm-signup.html", element: ConfirmSignupTemplate(), linkType: "email" },
  { file: "reset-password.html", element: ResetPasswordTemplate(), linkType: "recovery" },
];

describe.each(templates)("Supabase-Vorlage $file", ({ file, element, linkType }) => {
  const path = resolve(process.cwd(), "supabase/templates", file);

  it("matches the committed HTML file", async () => {
    const html = await render(element);
    if (process.env.UPDATE_AUTH_TEMPLATES === "1") {
      writeFileSync(path, html + "\n", "utf-8");
    }
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf-8")).toBe(html + "\n");
  });

  it("links to our own app via token hash, never to supabase.co", async () => {
    const html = await render(element);
    // In HTML-Attributen steht das „&" als „&amp;" — der Mail-Client macht
    // daraus wieder ein „&".
    expect(html).toContain(
      `href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=${linkType}"`,
    );
    expect(html).not.toContain("ConfirmationURL");
    expect(html).not.toContain("supabase.co");
  });

  it("uses the Sie form throughout", async () => {
    const text = await render(element, { plainText: true });
    expect(text).not.toMatch(/\b(du|dich|dir|dein|deine|deinem|deinen|deiner|deines)\b/i);
    expect(text).toMatch(/\b(Sie|Ihr|Ihre|Ihren|Ihrem|Ihnen)\b/);
  });

  it("keeps the legal placeholder as a Go template comment (invisible when sent)", async () => {
    const html = await render(element);
    expect(html).toMatch(/\{\{\/\* Pflichtangaben[^}]*\*\/\}\}/);
    expect(html).toContain("kontakt@narravit.de");
    expect(html).not.toContain("/impressum");
  });
});
