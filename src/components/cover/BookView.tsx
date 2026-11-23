import { CoverRender } from "@/components/cover/CoverRender";
import { getCoverColor, getSpineColors } from "@/lib/cover-colors";
import type { CoverData, CoverSize } from "@/lib/cover-types";
import { cn } from "@/lib/utils";

// PROJ-22: Das Cover als Buch mit angedeutetem Rücken. Die Vorderseite kommt
// unverändert aus CoverRender. Der Rücken ist nur Ansicht und wird weder
// gespeichert noch für den Druck verwendet (eigentlicher Rücken: PROJ-20).

type Props = {
  data: CoverData;
  size?: CoverSize;
  className?: string;
};

export function BookView({ data, size = "overview", className }: Props) {
  const color = getCoverColor(data.colorId);
  const { spine, edge } = getSpineColors(color);
  const spineText = [data.title.trim(), data.authorLine.trim()]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className={cn("w-full [container-type:inline-size]", className)}>
      <div className="flex w-full shadow-[0_14px_28px_rgba(62,56,49,0.3)]">
        <div
          aria-hidden
          className="relative w-[8cqw] shrink-0 border-r"
          style={{ backgroundColor: spine, borderColor: edge, color: color.ink }}
        >
          <span className="absolute inset-x-0 inset-y-[4%] rotate-180 overflow-hidden text-ellipsis whitespace-pre text-center [font-family:var(--font-merriweather)] [font-size:3.4cqw] [line-height:8cqw] [writing-mode:vertical-rl]">
            {spineText}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <CoverRender data={data} size={size} />
        </div>
      </div>
    </div>
  );
}
