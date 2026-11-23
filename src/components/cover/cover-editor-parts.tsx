"use client";

export function formatSavedTime(d: Date): string {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function normalizeSingleLine(s: string): string {
  // Kopierte Mehr-Zeilen (z. B. aus Word) auf eine Zeile reduzieren —
  // gemäß Edge Case in Spec.
  return s.replace(/[\r\n]+/g, " ");
}

export function FieldShell({
  label,
  hint,
  required,
  children,
  as = "label",
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  // "label" für einzelne Form-Inputs (Titel/Untertitel/Autor).
  // "div" für Gruppen mit eigenen Buttons (Muster-/Farb-Picker, Foto-
  // Upload) — sonst übernimmt der Wrap-`<label>` den gesamten Hilfstext
  // als Accessible Name der inneren Buttons (A11y-Bug + Screen-Reader-
  // Lärm).
  as?: "label" | "div";
}) {
  const Tag = as;
  return (
    <Tag className="flex flex-col gap-2">
      <span className="flex items-center justify-between gap-3 text-base font-medium text-[#3E3831]">
        <span>
          {label}
          {required ? <span className="text-[#a05959]"> *</span> : null}
        </span>
        {hint ? (
          <span className="text-xs text-[#848484]">{hint}</span>
        ) : null}
      </span>
      {children}
    </Tag>
  );
}

// Liest Width/Height eines Bildes vor dem Upload — für die Print-Warnung.
export function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht gelesen werden."));
    };
    img.src = url;
  });
}
