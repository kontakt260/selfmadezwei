"use client";

import { Check, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SaveState } from "@/lib/kapiteleditor/types";

export function SaveStatus({
  state,
  onRetry,
}: {
  state: SaveState;
  onRetry: () => void;
}) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-[#848484]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Wird gespeichert…
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-destructive">
        <AlertCircle className="h-3.5 w-3.5" />
        Fehler beim Speichern
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRetry}
          className="h-7 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10"
        >
          <RefreshCw className="h-3 w-3" />
          Erneut versuchen
        </Button>
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-[#96B897]">
        <Check className="h-3.5 w-3.5" />
        Gespeichert
      </span>
    );
  }
  return null;
}
