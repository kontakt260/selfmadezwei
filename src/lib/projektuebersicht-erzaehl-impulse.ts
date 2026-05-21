/** Vorgeschlagene Kapitelthemen für Erzähl-Impulse (Biografie / Lebensgeschichte).
 *
 * PROJ-8 Frontend-Phase (Stub):
 * Diese Liste ist Mock-Quelle für die UI. In /backend wird sie durch einen
 * server-seitigen DB-Read aus `impulse_catalog` ersetzt. Die DB-Tabelle
 * erhält dieselben Felder: `title`, `category`, `leading_questions` (Array).
 *
 * Pflege-Konvention: leading_questions enthält 1 bis ~4 Fragen pro Impuls.
 * Erste Frage (Index 0) ist der „Vorgeschmack" im Shuffle-Modal; alle Fragen
 * werden im Editor-Banner zyklisch rotiert.
 *
 * Inhaltliche Endredaktion erfolgt mit dem narravit-Team vor PROJ-8 Roll-out.
 */
export type ErzaehlImpuls = {
  /** Stabile ID — wird in /backend zur UUID aus impulse_catalog.id; in der
   * Frontend-Phase reicht ein Slug für die Optimistic-Add-Pipeline. */
  id: string;
  title: string;
  category: string;
  leading_questions: readonly string[];
};

export const ERZAEHL_IMPULSE: readonly ErzaehlImpuls[] = [
  {
    id: "kindheit-erinnerungen",
    title: "Kindheit und erste Erinnerungen",
    category: "Kindheit",
    leading_questions: [
      "Was ist deine früheste Erinnerung?",
      "Welche Gerüche oder Geräusche aus deiner Kindheit kommen dir sofort in den Sinn?",
      "Welches Spielzeug oder Spiel war dir besonders wichtig?",
      "Wer hat dir in jungen Jahren am meisten Geborgenheit gegeben?",
    ],
  },
  {
    id: "eltern-geschichte",
    title: "Meine Eltern und ihre Geschichte",
    category: "Familie",
    leading_questions: [
      "Wie haben sich deine Eltern kennengelernt?",
      "Welche Eigenschaften deiner Mutter erkennst du heute in dir wieder?",
      "Was hat dein Vater dir mitgegeben — bewusst oder unbewusst?",
      "Welche Geschichte aus dem Leben deiner Eltern erzählst du am liebsten weiter?",
    ],
  },
  {
    id: "schule-ausbildung",
    title: "Schule, Ausbildung und prägende Lehrer",
    category: "Bildung",
    leading_questions: [
      "Welche Lehrerin oder welcher Lehrer hat dich besonders geprägt — im Guten oder im Schlechten?",
      "Wann hast du dich in der Schule zum ersten Mal richtig wohl gefühlt?",
      "Welches Schulfach war dir am wichtigsten — und warum?",
      "Wie hast du dich für deinen Berufsweg entschieden?",
    ],
  },
  {
    id: "erste-liebe",
    title: "Erste große Liebe und Freundschaften",
    category: "Beziehungen",
    leading_questions: [
      "Wer war deine erste große Liebe?",
      "Wie habt ihr euch kennengelernt — und wie habt ihr euch wieder verloren?",
      "Welche Freundschaft aus jungen Jahren hat bis heute gehalten?",
      "Was hast du über dich selbst durch andere Menschen gelernt?",
    ],
  },
  {
    id: "berufseinstieg",
    title: "Berufseinstieg und wichtige Stationen",
    category: "Beruf",
    leading_questions: [
      "Was war dein erster Job — und wie hat er dich verändert?",
      "Welche berufliche Entscheidung hat dein Leben am stärksten beeinflusst?",
      "Wer war ein Mentor oder Vorbild auf deinem beruflichen Weg?",
      "Was würdest du deinem 25-jährigen Ich heute raten?",
    ],
  },
  {
    id: "wendepunkt",
    title: "Ein Wendepunkt in meinem Leben",
    category: "Lebensphasen",
    leading_questions: [
      "Gab es einen Moment, in dem alles plötzlich anders war?",
      "Hast du den Wendepunkt damals als solchen erkannt — oder erst im Rückblick?",
      "Wer oder was hat dir geholfen, ihn zu meistern?",
      "Was wäre aus deinem Leben geworden, wenn du anders entschieden hättest?",
    ],
  },
  {
    id: "reisen-begegnungen",
    title: "Reisen und Begegnungen, die mich geprägt haben",
    category: "Erfahrungen",
    leading_questions: [
      "Welche Reise hast du nie vergessen?",
      "Welche Begegnung mit einem Fremden hat dich am meisten berührt?",
      "Wo hast du zum ersten Mal das Gefühl gehabt, dich selbst zu finden?",
      "Welches Land oder welche Stadt würdest du gerne noch einmal besuchen?",
    ],
  },
  {
    id: "familie-gruenden",
    title: "Familie gründen — Kinder und Enkel",
    category: "Familie",
    leading_questions: [
      "Wie hat sich dein Leben mit der Geburt deines ersten Kindes verändert?",
      "Welche Werte wolltest du unbedingt weitergeben?",
      "Welche Momente mit deinen Kindern oder Enkeln möchtest du nie vergessen?",
      "Was wünschst du dir für deren Zukunft?",
    ],
  },
  {
    id: "herausforderungen",
    title: "Herausforderungen, die ich gemeistert habe",
    category: "Lebensphasen",
    leading_questions: [
      "Welche Phase in deinem Leben war die schwerste — und wie bist du da rausgekommen?",
      "Was hat dir Mut gemacht, wenn alles aussichtslos schien?",
      "Welche Krise hat dich rückblickend stärker gemacht?",
      "Wer war an deiner Seite, als du ihn am meisten gebraucht hast?",
    ],
  },
  {
    id: "wichtigstes-heute",
    title: "Was mir heute am wichtigsten ist",
    category: "Werte",
    leading_questions: [
      "Was zählt für dich heute mehr als noch vor 20 Jahren?",
      "Welche Person oder Sache würdest du auf keinen Fall mehr aufgeben wollen?",
      "Wie hat sich dein Verständnis von Glück verändert?",
      "Wofür stehst du heute morgens am liebsten auf?",
    ],
  },
  {
    id: "traditionen-feste",
    title: "Traditionen und Feste in unserer Familie",
    category: "Familie",
    leading_questions: [
      "Welche Tradition aus deiner Kindheit lebst du noch heute?",
      "Welches Fest war jedes Jahr ein besonderes Ereignis?",
      "Gibt es ein Familienrezept, das eine Geschichte erzählt?",
      "Welche eigene Tradition hast du in deiner Familie begründet?",
    ],
  },
  {
    id: "wichtiger-mensch",
    title: "Ein Mensch, der mir besonders viel bedeutet hat",
    category: "Beziehungen",
    leading_questions: [
      "An wen denkst du gerade — und warum?",
      "Was hat dich an diesem Menschen besonders beeindruckt?",
      "Welches Erlebnis mit ihm oder ihr trägst du wie einen Schatz in dir?",
      "Was würdest du ihm oder ihr heute gerne noch sagen?",
    ],
  },
  {
    id: "zuhause-orte",
    title: "Mein Zuhause und Orte, an denen ich gelebt habe",
    category: "Heimat",
    leading_questions: [
      "Welcher Ort hat sich für dich am meisten wie Heimat angefühlt?",
      "Wie hast du dir zum ersten Mal ein Zuhause selbst eingerichtet?",
      "Welches Haus oder welche Wohnung würdest du jederzeit zurückbekommen wollen?",
      "Wo möchtest du am liebsten alt werden — und warum dort?",
    ],
  },
  {
    id: "hobbys-leidenschaften",
    title: "Hobbys, Leidenschaften und was mir Freude bereitet",
    category: "Werte",
    leading_questions: [
      "Was machst du, wenn du die Zeit ganz vergisst?",
      "Welche Leidenschaft begleitet dich schon dein ganzes Leben?",
      "Gibt es etwas, das du gerne gelernt hättest — und das du jetzt noch beginnen könntest?",
      "Was wünschst du dir mehr in deinem Alltag?",
    ],
  },
  {
    id: "ratschlaege-naechste",
    title: "Ratschläge und Wünsche an die nächste Generation",
    category: "Werte",
    leading_questions: [
      "Welcher Rat hat dir selbst am meisten geholfen?",
      "Welche Fehler würdest du der nächsten Generation gerne ersparen?",
      "Was wünschst du deinen Kindern und Enkeln für ihre Zukunft?",
      "Welcher Gedanke darf nicht verloren gehen, wenn du einmal nicht mehr da bist?",
    ],
  },
] as const;

/** Helper für Komponenten, die nur Titel brauchen (z. B. Modal-Pre-Render). */
export function impulseTitlesOnly(): readonly string[] {
  return ERZAEHL_IMPULSE.map((i) => i.title);
}

/** Legacy-Export — alte Importe bleiben kompatibel, bis /backend den
 * gesamten Pfad auf DB umstellt. */
export const ERZAEHL_IMPULSE_TITLES: readonly string[] = ERZAEHL_IMPULSE.map(
  (i) => i.title,
);
