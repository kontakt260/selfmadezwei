import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { cleanupTestData } from "../tests/helpers/cleanup-test-data.mjs";
import { readEnvLocal, STAGE_HOST, testServerEnv } from "../tests/helpers/server-env.mjs";

// PROJ-31: Zwei Testläufe mit je einem Befehl und einem Build.
//
//   npm run test:quick   Unit-Tests und die wichtigsten Wege
//   npm run test:full    alle Tests
//
// Die Gruppen laufen auch nach einem Fehlschlag weiter, damit ein Lauf alle
// Fehler zeigt. Temporäre Testdaten werden vorher und nachher aufgeräumt.

const APP_PORT = 3000;
const RATE_LIMIT_PORT = 3001;

const SUITE_SWITCHES = {
  E2E_ACCOUNT_DELETION: "1",
  E2E_DESIGN: "1",
  E2E_READ_ONLY: "1",
  E2E_TRASH: "1",
  E2E_ACCESS_RULES: "1",
  E2E_RETENTION: "1",
  E2E_PURCHASE: "1",
  E2E_LOADING: "1",
  E2E_EDITOR: "1",
};

const spec = (name) => `tests/${name}.spec.ts`;

const QUICK_GROUPS = [
  {
    name: "Kernwege mit QA-Konto",
    workers: 1,
    files: ["PROJ-2-auth-ssr", "PROJ-4-kapitel-routing-persistenz", "PROJ-5-kapitel-editor"],
    grep: [
      "unauthenticated user is redirected from / to",
      "login with a wrong password",
      "/anmelden shows login form",
      "AC-Home-1:",
      "AC-PÜ-1:",
      "AC-Sec-3:",
      // AC-Pag-2 baut auf dem Inhalt aus AC-Pag-1 auf.
      "AC-Pag-1:",
      "AC-Pag-2:",
      "AC-Save-1:",
    ],
  },
  {
    name: "Kernwege mit eigenen Konten",
    workers: 3,
    files: ["PROJ-24-kaufwege", "PROJ-28-lesemodus", "PROJ-30-ladezeiten"],
    grep: [
      "AC-17: Angemeldeter Kauf",
      "AC-5, AC-8: Kapitel-Editor",
      "AC-26: Bloßes Öffnen",
      "AC-22, AC-26: Zurück-Taste",
      "AC-22, AC-26: Langsames Speichern",
    ],
  },
  {
    name: "Kernwege im Editor",
    workers: 1,
    files: ["PROJ-25-editor-stabil"],
    grep: ["AC-1 bis AC-4:", "AC-7 bis AC-9: Bilder bewegen sich beim Tippen", "AC-21 bis AC-23:"],
  },
];

const FULL_GROUPS = [
  {
    // Lesen nur oder arbeiten ohne Konto, das QA-Projekt bleibt unverändert.
    name: "Ohne Änderungen am QA-Konto",
    workers: 4,
    files: [
      "PROJ-2-auth-ssr",
      "PROJ-3-persoenlicher-bereich",
      "PROJ-6-stripe-zahlungen",
      "PROJ-24-onboarding",
    ],
  },
  {
    // Teilen sich das QA-Projekt und würden sich parallel stören.
    name: "Gemeinsames QA-Konto",
    workers: 1,
    files: [
      "PROJ-4-kapitel-routing-persistenz",
      "PROJ-5-kapitel-editor",
      "PROJ-5-bild-upload",
      "PROJ-7-buchweite-seitenzahl",
      "PROJ-8-erzaehl-impulse",
      "PROJ-9-mitglieder-einladungen",
      "PROJ-10-cover-editor",
      "PROJ-19-production-hardening",
    ],
  },
  {
    name: "Eigene Testkonten",
    workers: 5,
    files: [
      "PROJ-3-konto-loeschen",
      "PROJ-6-zugriffsregeln",
      "PROJ-22-design-grundlage",
      "PROJ-24-kaufwege",
      "PROJ-28-lesemodus",
      "PROJ-30-ladezeiten",
    ],
  },
  {
    // Misst Bewegungen und Zeiten und läuft deshalb allein.
    name: "Editor-Stabilität",
    workers: 1,
    files: ["PROJ-25-editor-stabil", "PROJ-25-pruefliste"],
  },
  {
    // Lösch- und Papierkorb-Läufe wirken auf die ganze Datenbank.
    name: "Papierkorb und Löschläufe",
    workers: 1,
    files: ["PROJ-26-papierkorb", "PROJ-28-qa", "PROJ-28-loeschlauf"],
  },
  {
    name: "Rate-Limit",
    workers: 1,
    files: ["PROJ-17-rate-limiting"],
    env: { E2E_RATE_LIMIT: "1", E2E_BASE_URL: `http://localhost:${RATE_LIMIT_PORT}` },
  },
];

const seconds = (start) => Math.round((Date.now() - start) / 1000);
const clock = (total) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitForServer(port) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${port}/anmelden`);
      if (response.ok) return;
    } catch {
      // Der Server startet noch.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Der Testserver auf Port ${port} ist nicht gestartet.`);
}

function startServer(port, rateLimit) {
  return spawn("node_modules/.bin/next", ["start", "-p", String(port)], {
    env: { ...process.env, ...testServerEnv({ rateLimit }) },
    stdio: "ignore",
  });
}

function runStep(command, args, env = {}) {
  return spawnSync(command, args, { stdio: "inherit", env: { ...process.env, ...env } }).status === 0;
}

function runGroup(group) {
  const args = [
    "playwright",
    "test",
    ...group.files.map(spec),
    "--project=chromium",
    `--workers=${group.workers}`,
    "--reporter=dot",
  ];
  if (group.grep) args.push(`--grep=${group.grep.map(escapeRegExp).join("|")}`);
  return runStep("npx", args, { ...SUITE_SWITCHES, ...group.env });
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "quick" && mode !== "full") {
    console.error("Aufruf: node scripts/run-tests.mjs quick|full");
    return 2;
  }
  const env = readEnvLocal();
  if (new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid").host !== STAGE_HOST) {
    console.error("Abbruch: Die Tests laufen nur gegen die Stage-Datenbank.");
    return 2;
  }
  const ports = mode === "full" ? [APP_PORT, RATE_LIMIT_PORT] : [APP_PORT];
  for (const port of ports) {
    if (await portInUse(port)) {
      console.error(`Abbruch: Port ${port} ist belegt. Bitte den laufenden Server beenden.`);
      return 2;
    }
  }

  const started = Date.now();
  const results = [];
  const step = (name, run) => {
    const begin = Date.now();
    console.log(`\n=== ${name}`);
    const ok = run();
    results.push({ name, ok, seconds: seconds(begin) });
    return ok;
  };

  const before = await cleanupTestData(env);
  if (before.users > 0) console.log(`Alte Testdaten entfernt: ${before.users} Konten, ${before.projects} Projekte`);

  step("Unit-Tests", () => runStep("npx", ["vitest", "run"]));
  // Mit Testumgebung: Der Turnstile-Testschlüssel wird beim Build eingebaut.
  if (!step("Build", () => runStep("npm", ["run", "build"], testServerEnv()))) return finish(results, started);

  const servers = [startServer(APP_PORT, false)];
  if (mode === "full") servers.push(startServer(RATE_LIMIT_PORT, true));
  try {
    await Promise.all(ports.map(waitForServer));
    for (const group of mode === "full" ? FULL_GROUPS : QUICK_GROUPS) {
      step(group.name, () => runGroup(group));
    }
  } finally {
    for (const server of servers) server.kill();
    const after = await cleanupTestData(env)
      .catch(async () => {
        // Einmal wiederholen: Nach dem langen Lauf bricht die Verbindung gelegentlich ab.
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        return cleanupTestData(env);
      })
      .catch((error) => {
        console.error(`Aufräumen fehlgeschlagen: ${error.message}`);
        results.push({ name: "Aufräumen", ok: false, seconds: 0 });
        return { users: 0, projects: 0 };
      });
    if (after.users > 0) console.log(`Testdaten entfernt: ${after.users} Konten, ${after.projects} Projekte`);
  }
  return finish(results, started);
}

function finish(results, started) {
  console.log("\n=== Ergebnis");
  for (const result of results) {
    console.log(`${result.ok ? "ok    " : "FEHLER"} ${result.name} (${clock(result.seconds)})`);
  }
  console.log(`Gesamt: ${clock(seconds(started))}`);
  return results.every((result) => result.ok) ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
