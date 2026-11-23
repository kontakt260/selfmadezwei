import { redirect } from "next/navigation";

// PROJ-28: Abgelaufene Projekte bleiben sichtbar und werden direkt in der
// Projektübersicht verlängert. Diese Adresse bleibt nur, damit alte Links
// nicht ins Leere laufen.
export default function ZugangAbgelaufenPage(): never {
  redirect("/");
}
