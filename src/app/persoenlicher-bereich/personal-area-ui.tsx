"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Sub-components ──────────────────────────────────────────────────────────

// Name und E-Mail dürfen umbrechen, damit lange Angaben vollständig lesbar bleiben.
export const fieldTextClass =
  "min-h-[3.375rem] w-full rounded-none border px-3.5 py-3 text-lg leading-7 [overflow-wrap:anywhere] sm:text-[1.1875rem] md:text-[1.1875rem]";
export const bodyTextClass = "text-lg leading-normal text-[#4A453F] sm:text-[1.1875rem]";

export function SectionShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex w-full flex-col gap-5 border border-[#E0DCD5] bg-white p-5 sm:p-8 ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[1.75rem] leading-tight text-[#3E3831] sm:text-3xl">{children}</h2>;
}

export function SandButton({
  type = "button",
  disabled,
  children,
  onClick,
  className = "",
}: {
  type?: "button" | "submit";
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn("h-[3.375rem] w-full shrink-0 px-6 text-lg font-bold sm:w-auto", className)}
    >
      {children}
    </Button>
  );
}
