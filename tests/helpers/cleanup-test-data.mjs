import { createClient } from "@supabase/supabase-js";

// PROJ-31: Räumt temporäre E2E-Daten auf Stage auf, auch nach einem Abbruch.
//
// Gelöscht werden nur Konten mit Test-Präfix und der Domain example.test sowie
// Projekte, in denen ausschließlich solche Konten Mitglied sind. Das QA-Konto
// passt nicht auf das Muster und wird zusätzlich ausdrücklich geschützt.

const TEST_EMAIL = /^e2e-[a-z0-9-]+@example\.test$/;
const PROTECTED_EMAIL = "qa-test@narravit.de";
const BUCKETS = ["project-logos", "chapter-heroes", "project-covers", "exports"];

async function listFiles(admin, bucket, folder) {
  const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
  if (error) throw new Error(error.message);
  const files = [];
  for (const entry of data ?? []) {
    const entryPath = `${folder}/${entry.name}`;
    if (entry.id) files.push(entryPath);
    else files.push(...(await listFiles(admin, bucket, entryPath)));
  }
  return files;
}

async function removeProject(admin, projectId) {
  for (const bucket of BUCKETS) {
    const files = await listFiles(admin, bucket, projectId);
    if (files.length > 0) await admin.storage.from(bucket).remove(files);
  }
  await admin.from("mail_log").delete().eq("project_id", projectId);
  const { error } = await admin.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);
  await admin.from("storage_chapter_cleanup_queue").delete().eq("project_id", projectId);
  await admin.from("storage_cleanup_queue").delete().eq("project_id", projectId);
}

export async function cleanupTestData(env) {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const testUsers = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const user of data.users) {
      if (user.email !== PROTECTED_EMAIL && TEST_EMAIL.test(user.email ?? "")) testUsers.push(user);
    }
    if (data.users.length < 1000) break;
  }
  if (testUsers.length === 0) return { users: 0, projects: 0 };

  const testIds = new Set(testUsers.map((user) => user.id));
  const { data: memberships, error } = await admin
    .from("project_members")
    .select("project_id")
    .in("user_id", [...testIds]);
  if (error) throw new Error(error.message);

  let projects = 0;
  for (const projectId of new Set((memberships ?? []).map((row) => row.project_id))) {
    const { data: members, error: membersError } = await admin
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId);
    if (membersError) throw new Error(membersError.message);
    if ((members ?? []).some((member) => !testIds.has(member.user_id))) continue;
    await removeProject(admin, projectId);
    projects += 1;
  }

  for (const user of testUsers) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(deleteError.message);
  }
  return { users: testUsers.length, projects };
}
