"use client";

import type { ComponentProps, ReactNode } from "react";
import Link, { useLinkStatus } from "next/link";

function OpenLabel({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <span aria-live="polite">{pending ? "Wird geöffnet …" : children}</span>;
}

// PROJ-30: Kapitel werden nicht vorgeladen, sonst gäbe es bei einem vollen Buch
// bis zu 40 Anfragen pro Besuch. Der Link zeigt sofort, dass etwas passiert.
export function ChapterOpenLink({
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "prefetch">) {
  return (
    <Link {...props} prefetch={false}>
      <OpenLabel>{children}</OpenLabel>
    </Link>
  );
}
