/**
 * Ersetzt alle Nicht-ASCII-Zeichen durch numerische HTML-Codes („ü" → `&#252;`).
 *
 * Gilt für das HTML aller Mails: App-Mails (`sendEmail`) und die Supabase-
 * Vorlagen, die von Hand ins Dashboard kopiert werden. Dort kamen am
 * 2026-11-21 Umlaute, Anführungszeichen und Striche kaputt an („f√ºr").
 * Reines ASCII übersteht jede Kodierung auf dem Weg bis ins Postfach.
 *
 * Nur für HTML verwenden. In der Klartext-Fassung und im Betreff stünden die
 * Codes sonst wörtlich da; beide bleiben UTF-8.
 */
export function encodeNonAscii(html: string): string {
  return html.replace(/[^\x00-\x7F]/gu, (char) => `&#${char.codePointAt(0)};`);
}
