"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { startCheckoutAction } from "@/app/checkout/actions";
import { cn } from "@/lib/utils";

// Startet den Stripe-Checkout (Projektübersicht und „Zugang abgelaufen").

export function CheckoutButton({
  label,
  loadingLabel,
  input,
  disabled,
  className,
}: {
  label: string;
  loadingLabel: string;
  input: Parameters<typeof startCheckoutAction>[0];
  disabled?: boolean;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await startCheckoutAction(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Stripe Hosted Checkout — Vollredirect.
      window.location.href = res.checkoutUrl;
    });
  };
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending || disabled}
        className={cn(
          "inline-flex h-12 w-full min-w-0 cursor-pointer items-center justify-center gap-2 bg-[#0A0909]/5 px-4 text-base font-bold leading-6 text-[#534B42] transition-colors hover:bg-[#0A0909]/10 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-56 sm:text-lg",
          className,
        )}
      >
        {isPending ? (
          <>
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
            {loadingLabel}
          </>
        ) : (
          label
        )}
      </button>
      {error && (
        <p
          className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-base text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
