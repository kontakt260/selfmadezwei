// `next/font` läuft nur im Next-Build (der Compiler ersetzt die Aufrufe). In
// Vitest steht hier ein Platzhalter mit derselben Form: leere Klassen und
// Variablen. Siehe vitest.config.ts (PROJ-32, Buchschriften).

type FontResult = { className: string; variable: string; style: { fontFamily: string } };

const font = (): FontResult => ({ className: "", variable: "", style: { fontFamily: "" } });

export const EB_Garamond = font;
export const Baskervville = font;
export const Atkinson_Hyperlegible = font;
export default font;
