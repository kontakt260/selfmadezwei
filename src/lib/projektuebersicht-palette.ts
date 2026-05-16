const ACCENT_BACKGROUNDS = [
  "#96B897",
  "#597083",
  "#D0BCA6",
  "#9B8AA6",
  "#7A9EAF",
  "#B89A7A",
  "#8A9B7A",
  "#A67C7C",
] as const;

function stableIndex(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % ACCENT_BACKGROUNDS.length;
}

export function accentColorForStableId(id: string): string {
  return ACCENT_BACKGROUNDS[stableIndex(id)];
}

export function accentForegroundForBackground(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return "#3E3831";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 160 ? "#1a1a1a" : "#FAF8F6";
}
