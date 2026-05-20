"use client";

import { Minus, Plus } from "lucide-react";

// 5 Stufen — leicht zu cyclen via +/-. 100 % ist die Default-Stufe.
export const ZOOM_STEPS = [0.75, 1.0, 1.25, 1.5, 2.0] as const;
export type ZoomLevel = (typeof ZOOM_STEPS)[number];
export const DEFAULT_ZOOM: ZoomLevel = 1.0;

export function ZoomControl({
  zoom,
  onChange,
}: {
  zoom: ZoomLevel;
  onChange: (next: ZoomLevel) => void;
}) {
  const currentIdx = ZOOM_STEPS.indexOf(zoom);
  const canDecrease = currentIdx > 0;
  const canIncrease = currentIdx < ZOOM_STEPS.length - 1;

  const decrease = () => {
    if (canDecrease) onChange(ZOOM_STEPS[currentIdx - 1]);
  };
  const increase = () => {
    if (canIncrease) onChange(ZOOM_STEPS[currentIdx + 1]);
  };

  return (
    <div className="flex items-center gap-0.5 border border-[#e0dcd5] bg-white">
      <button
        type="button"
        onClick={decrease}
        disabled={!canDecrease}
        aria-label="Verkleinern"
        className="flex h-7 w-7 items-center justify-center text-[#3E3831] transition-colors hover:bg-[#FAF8F6] disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span
        aria-label={`Zoom-Stufe ${Math.round(zoom * 100)} Prozent`}
        className="min-w-[3rem] select-none text-center text-[10pt] font-medium tabular-nums text-[#3E3831]"
      >
        {Math.round(zoom * 100)} %
      </span>
      <button
        type="button"
        onClick={increase}
        disabled={!canIncrease}
        aria-label="Vergrößern"
        className="flex h-7 w-7 items-center justify-center text-[#3E3831] transition-colors hover:bg-[#FAF8F6] disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
