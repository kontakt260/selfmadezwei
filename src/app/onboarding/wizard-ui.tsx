"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// PROJ-24: gemeinsame Bausteine der Onboarding-Schritte.

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-2 text-base font-bold leading-6 text-[#9C1C1C]">
      {message}
    </p>
  );
}

export function ChoiceCard({
  selected,
  onClick,
  title,
  description,
  disabled = false,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex min-h-11 w-full items-start justify-between gap-3 border p-5 text-left [font-family:var(--font-lato)] text-lg font-bold text-[#3E3831] transition-colors",
        selected
          ? "border-[#557559] bg-[#F3F7F3] shadow-[inset_0_0_0_1px_#557559]"
          : "border-[#BDB5AA] bg-white hover:border-[#557559]",
        disabled && "cursor-not-allowed opacity-50 hover:border-[#BDB5AA]",
      )}
    >
      <span className="min-w-0">
        <span className="block">{title}</span>
        {description ? (
          <span className="mt-2 block text-base font-normal leading-6 text-[#4A453F]">
            {description}
          </span>
        ) : null}
      </span>
      {selected ? <Check aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-[#2B452F]" /> : null}
    </button>
  );
}
