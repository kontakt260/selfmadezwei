import { CoverRender } from "@/components/cover/CoverRender";
import { getCoverColor, getSpineColors } from "@/lib/cover-colors";
import type { CoverData, CoverSize } from "@/lib/cover-types";
import { cn } from "@/lib/utils";
import { coverFonts } from "@/components/cover/coverFonts";

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
  // PROJ-32: Der Rücken folgt der Buchschrift wie der Titel.
  const fonts = coverFonts(data.bookFont);
  const spineText = [data.title.trim(), data.authorLine.trim()]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className={cn("w-full [container-type:inline-size]", fonts.variables, className)}>
      <div className="flex w-full shadow-[0_18px_36px_rgba(43,39,34,0.38)]">
        <div
          aria-hidden
          className="relative w-[8cqw] shrink-0 border-r"
          style={{ backgroundColor: spine, borderColor: edge, color: color.ink }}
        >
          <span
            className="absolute inset-x-0 inset-y-[4%] rotate-180 overflow-hidden text-ellipsis whitespace-pre text-center [font-size:3.4cqw] [line-height:8cqw] [writing-mode:vertical-rl]"
            style={{ fontFamily: fonts.title }}
          >
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
