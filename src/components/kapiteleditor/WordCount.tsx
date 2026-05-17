export function WordCount({ words }: { words: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-[#848484]">
      <span className="font-medium text-[#3E3831]">{words.toLocaleString("de-DE")}</span>
      {words === 1 ? "Wort" : "Wörter"}
    </span>
  );
}
