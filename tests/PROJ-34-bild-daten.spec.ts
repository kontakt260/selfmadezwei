import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { assertStage, createTestAccount, readEnvLocal, restRequest } from "./helpers/stage";

// PROJ-34 — Aufräumliste entfernter Fotos gegen die echte Stage-Datenbank.
//
// Die Suite legt ein eigenes Konto mit Projekt und Kapitel an und räumt danach
// alles weg. Sie lädt keine Dateien hoch, ruft nie die Cron-Route auf und
// löscht nichts aus dem Speicher.

const RUN_ID = crypto.randomBytes(4).toString("hex");
const DAY_MS = 86_400_000;
const QUEUE = "storage_image_cleanup_queue";

type Photo = { id: string; storage_path: string; signed_url: string; alt: string };

let admin: SupabaseClient;
let supabaseUrl: string;
let anonKey: string;
let userId = "";
const projectId = crypto.randomUUID();
const chapterId = crypto.randomUUID();

const photo = (name: string): Photo => ({
  id: name,
  storage_path: `${projectId}/${chapterId}/${name}.jpg`,
  signed_url: "",
  alt: "",
});

const sections = (start: Photo[], extra: Record<string, unknown> = {}) => ({
  start: { layout: "1-spaltig", images: start },
  end: { layout: "1-spaltig", images: [] },
  ...extra,
});

async function save(value: unknown): Promise<void> {
  const { error } = await admin.from("chapters").update({ image_sections: value }).eq("id", chapterId);
  if (error) throw new Error(error.message);
}

async function queuedPaths(): Promise<string[]> {
  const { data, error } = await admin
    .from(QUEUE)
    .select("storage_path")
    .eq("chapter_id", chapterId)
    .order("storage_path");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.storage_path as string);
}

test.describe.serial("PROJ-34 — Aufräumliste entfernter Fotos (nur Stage)", () => {
  test.beforeAll(async () => {
    const env = readEnvLocal();
    assertStage(env);
    supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    admin = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const account = await createTestAccount(admin, {
      email: `e2e-bilddaten-${RUN_ID}@example.test`,
      name: "Test Bilddaten",
    });
    userId = account.id;
    for (const step of [
      admin.from("projects").insert({ id: projectId, title: `Bilddaten ${RUN_ID}`, owner_id: userId }),
      admin.from("project_access").insert({
        project_id: projectId,
        expires_at: new Date(Date.now() + 100 * DAY_MS).toISOString(),
      }),
      admin.from("project_members").insert({ project_id: projectId, user_id: userId, role: "projektleiter" }),
      admin.from("chapters").insert({
        id: chapterId,
        project_id: projectId,
        title: "Kapitel 1",
        sort_order: 0,
        page_count: 1,
        body: { type: "doc", content: [{ type: "paragraph" }] },
      }),
    ]) {
      const { error } = await step;
      if (error) throw new Error(error.message);
    }
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin.from(QUEUE).delete().eq("chapter_id", chapterId);
    await admin.from("projects").delete().eq("id", projectId);
    await admin.from("storage_cleanup_queue").delete().eq("project_id", projectId);
    await admin.from("storage_chapter_cleanup_queue").delete().eq("chapter_id", chapterId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  test("AC-19, AC-20: Entferntes Foto bleibt 14 Tage und kommt mit Rückgängig von der Liste", async () => {
    const first = photo("erstes");
    const second = photo("zweites");
    await save(sections([first, second]));
    expect(await queuedPaths()).toEqual([]);

    await save(sections([second]));
    expect(await queuedPaths()).toEqual([first.storage_path]);
    const { data, error } = await admin
      .from(QUEUE)
      .select("created_at, delete_after, project_id")
      .eq("storage_path", first.storage_path)
      .single();
    if (error) throw new Error(error.message);
    expect(data.project_id).toBe(projectId);
    // Beide Zeitpunkte kommen aus der Datenbank, die Rechneruhr spielt keine Rolle.
    expect(new Date(data.delete_after).getTime() - new Date(data.created_at).getTime()).toBe(14 * DAY_MS);

    await save(sections([second, first]));
    expect(await queuedPaths()).toEqual([]);
  });

  test("AC-35: Abschnitte im Text werden erfasst", async () => {
    const sectionId = crypto.randomUUID();
    const inText = photo("im-text");
    const kept = photo("bleibt");
    await save(
      sections([kept], {
        inline: { [sectionId]: { layout: "2-spaltig", images: [inText] } },
        placed: true,
      }),
    );
    await save(sections([kept], { placed: true }));
    expect(await queuedPaths()).toContain(inText.storage_path);
    expect(await queuedPaths()).not.toContain(kept.storage_path);
  });

  test("AC-34: Fremde Pfade kommen nie auf die Liste", async () => {
    await save(sections([]));
    await admin.from(QUEUE).delete().eq("chapter_id", chapterId);
    const foreign = [
      `${crypto.randomUUID()}/${chapterId}/fremd.jpg`,
      `${projectId}/${crypto.randomUUID()}/fremd.jpg`,
      `${projectId}/${chapterId}/../fremd.jpg`,
    ];
    await save(
      sections(foreign.map((storage_path, index) => ({ id: `f${index}`, storage_path, signed_url: "", alt: "" }))),
    );
    await save(sections([]));
    expect(await queuedPaths()).toEqual([]);
  });

  test("Unerwartete Bilddaten blockieren das Speichern nicht", async () => {
    for (const inline of ["kaputt", { x: "kaputt" }, { x: { images: [1, null, { storage_path: 7 }] } }]) {
      await save(sections([], { inline }));
    }
    await save(sections([]));
    expect(await queuedPaths()).toEqual([]);
  });

  test("Ohne Service-Role gibt es keinen Zugriff auf die Liste", async () => {
    const connection = { supabaseUrl, anonKey };
    const read = await restRequest(connection, `${QUEUE}?select=storage_path&limit=1`, { method: "GET" });
    expect(read.status).toBe(401);
    const write = await restRequest(connection, QUEUE, {
      method: "POST",
      body: JSON.stringify({
        storage_path: `${projectId}/${chapterId}/angriff.jpg`,
        chapter_id: chapterId,
        project_id: projectId,
      }),
    });
    expect(write.status).toBe(401);
  });

  test("Die Abfrage des Cron-Laufs auf den Papierkorb ist gültig", async () => {
    const { error } = await admin
      .from("trash_chapters")
      .select("image_sections:snapshot->image_sections")
      .in("chapter_id", [crypto.randomUUID()])
      .limit(1);
    expect(error).toBeNull();
  });
});
