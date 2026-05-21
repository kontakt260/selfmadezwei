"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
const uuidSchema = z.string().regex(UUID_RE, "Ungültige ID.");
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "E-Mail-Adresse fehlt.")
  .max(254, "E-Mail-Adresse zu lang.")
  .email("Ungültiges E-Mail-Format.");

const roleSchema = z.enum(["projektleiter", "co_author"]);

const createInvitationSchema = z.object({
  projectId: uuidSchema,
  email: emailSchema,
  role: roleSchema,
});

const acceptInvitationSchema = z.object({
  token: z.string().min(16).max(256),
});

const removeMemberSchema = z.object({
  projectId: uuidSchema,
  memberId: uuidSchema,
});

const leaveProjectSchema = z.object({
  projectId: uuidSchema,
});

// ─── Helper: opaque Token (≥ 128 Bit Entropie) ───────────────────────────────
//
// 32 Bytes Random = 256 Bit Entropie, base64url-encoded ≈ 43 Zeichen. Spec
// fordert ≥ 128 Bit; wir gehen mit Faktor 2 drüber für Future-Proofing.

function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

const INVITATION_VALIDITY_DAYS = 14;

// ─── createInvitationAction ──────────────────────────────────────────────────

export async function createInvitationAction(formData: FormData): Promise<{
  token?: string;
  acceptUrl?: string;
  error?: string;
}> {
  const parsed = createInvitationSchema.safeParse({
    projectId: formData.get("projectId"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  const { projectId, email, role } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  // Self-Invite ablehnen.
  const ownEmail = (user.email ?? "").trim().toLowerCase();
  if (ownEmail === email) {
    return { error: "Du kannst dich nicht selbst einladen." };
  }

  // PL-Check + bereits-Mitglied-Check kombiniert: lese eigene Rolle und alle
  // Mitglieder. RLS hat das ohnehin schon eingegrenzt — nur Projekte sichtbar,
  // in denen man Member ist.
  const { data: members } = await supabase
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", projectId);

  const myMembership = (members ?? []).find((m) => m.user_id === user.id);
  if (!myMembership) return { error: "Projekt nicht gefunden." };
  if (myMembership.role !== "projektleiter") {
    return { error: "Nur Projektleiter dürfen Einladungen erstellen." };
  }

  // Bereits-Mitglied-Check: lese alle Profile-Emails der Mitglieder.
  const memberUserIds = (members ?? []).map((m) => m.user_id);
  if (memberUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("email")
      .in("id", memberUserIds);
    const memberEmails = new Set(
      (profiles ?? [])
        .map((p) => (p.email ?? "").trim().toLowerCase())
        .filter((e) => e.length > 0),
    );
    if (memberEmails.has(email)) {
      return { error: "Diese Person ist bereits Mitglied dieses Projekts." };
    }
  }

  const token = generateInviteToken();
  const expiresAt = new Date(
    Date.now() + INVITATION_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error: insertErr } = await supabase.from("invitations").insert({
    project_id: projectId,
    email,
    role,
    token,
    expires_at: expiresAt,
    created_by: user.id,
  });
  if (insertErr) {
    return { error: "Einladung konnte nicht erstellt werden." };
  }

  // Origin für absoluten Link.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://app.narravit.de";
  const acceptUrl = `${siteUrl}/einladung/${token}`;

  revalidatePath(`/projektuebersicht/${projectId}`);
  return { token, acceptUrl };
}

// ─── removeMemberAction ──────────────────────────────────────────────────────

export async function removeMemberAction(formData: FormData): Promise<{
  ok?: true;
  error?: string;
}> {
  const parsed = removeMemberSchema.safeParse({
    projectId: formData.get("projectId"),
    memberId: formData.get("memberId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  const { projectId, memberId } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  // RLS auf project_members.DELETE prüft PL ODER self — Server-Action zusätzlich
  // anweisen, dass wir hier den PL-Pfad meinen: target darf nicht user.id sein
  // (sonst gilt der Self-Leave-Pfad → leaveProjectAction).
  const { data: target } = await supabase
    .from("project_members")
    .select("user_id, project_id")
    .eq("id", memberId)
    .maybeSingle();
  if (!target || target.project_id !== projectId) {
    return { error: "Mitglied nicht gefunden." };
  }

  // DELETE — RLS-Policy „delete by pl or self" + Last-PL-Trigger schützen uns.
  const { error: delErr } = await supabase
    .from("project_members")
    .delete()
    .eq("id", memberId)
    .eq("project_id", projectId);

  if (delErr) {
    // 23514 = Last-PL-Trigger
    if (delErr.code === "23514") {
      return { error: "Mindestens ein Projektleiter muss verbleiben." };
    }
    return { error: "Mitglied konnte nicht entfernt werden." };
  }

  revalidatePath(`/projektuebersicht/${projectId}`);
  return { ok: true };
}

// Anmerkung: changeRoleAction wurde am 2026-05-21 entfernt. Rollen sind
// nach Einladungs-Annahme fest — soll jemand eine andere Rolle bekommen,
// entferne ihn aus dem Projekt und sende eine neue Einladung mit der
// gewünschten Rolle. Die zugehörige RLS-UPDATE-Policy und der Last-PL-
// UPDATE-Trigger wurden in der Migration `20260521235000_proj9_lock_member_roles.sql`
// entfernt.

// ─── leaveProjectAction ──────────────────────────────────────────────────────

export async function leaveProjectAction(formData: FormData): Promise<{
  error?: string;
}> {
  const parsed = leaveProjectSchema.safeParse({
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  const { projectId } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const { error: delErr } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", user.id);

  if (delErr) {
    if (delErr.code === "23514") {
      return {
        error:
          "Befördere zuerst eine andere Person zum Projektleiter, bevor du das Projekt verlässt.",
      };
    }
    return { error: "Projekt konnte nicht verlassen werden." };
  }

  revalidatePath("/");
  redirect("/persoenlicher-bereich");
}

// ─── acceptInvitationAction ──────────────────────────────────────────────────
//
// Strikte E-Mail-Übereinstimmung — siehe Spec H.1. Schreibt via Service-Role,
// weil die invitations.UPDATE-Policy nichts erlaubt + project_members.INSERT
// Policy verlangt PL-Status, den der Eingeladene noch nicht hat.

export async function acceptInvitationAction(formData: FormData): Promise<{
  projectId?: string;
  error?: string;
}> {
  const parsed = acceptInvitationSchema.safeParse({
    token: formData.get("token"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  const { token } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bitte zuerst anmelden." };

  // Token-Lookup über SECURITY DEFINER-Function (umgeht RLS sauber).
  const { data: lookup, error: lookupErr } = await supabase
    .rpc("lookup_invitation_by_token", { p_token: token })
    .maybeSingle();
  if (lookupErr || !lookup) {
    return { error: "Einladung nicht gefunden." };
  }

  // Validierungen (Defense-in-Depth — Server-Component hat das auch geprüft).
  if (lookup.accepted_at !== null) {
    return { error: "Diese Einladung wurde bereits angenommen." };
  }
  if (new Date(lookup.expires_at).getTime() < Date.now()) {
    return { error: "Diese Einladung ist abgelaufen." };
  }
  if (!lookup.project_id) {
    return { error: "Dieses Projekt existiert nicht mehr." };
  }

  const ownEmail = (user.email ?? "").trim().toLowerCase();
  const inviteEmail = (lookup.email ?? "").trim().toLowerCase();
  if (ownEmail !== inviteEmail) {
    return {
      error: `Diese Einladung gilt für ${lookup.email}. Du bist als ${user.email} eingeloggt.`,
    };
  }

  // Write via Service-Role: INSERT project_members + UPDATE invitations
  // in einer Transaktion-ähnlichen Sequenz.
  const serviceRole = createServiceRoleClient();

  // 1. Mitgliedschaft anlegen.
  const { error: memberInsertErr } = await serviceRole
    .from("project_members")
    .insert({
      project_id: lookup.project_id,
      user_id: user.id,
      role: lookup.role,
    });
  if (memberInsertErr) {
    // Doppelt-eingeladen → user ist schon Mitglied → wir markieren accepted
    // trotzdem, damit der Token nicht zweimal gültig bleibt.
    if (memberInsertErr.code !== "23505") {
      return { error: "Beitritt fehlgeschlagen." };
    }
  }

  // 2. Invitation als angenommen markieren.
  const { error: updErr } = await serviceRole
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", lookup.invitation_id);
  if (updErr) {
    return { error: "Annahme konnte nicht persistiert werden." };
  }

  revalidatePath(`/projektuebersicht/${lookup.project_id}`);
  return { projectId: lookup.project_id };
}
