import Image from "next/image";

export function FirstPageHeader({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center">
      <Image
        src="/logo.svg"
        alt=""
        width={56}
        height={50}
        className="h-12 w-auto"
        style={{ filter: "brightness(0)" }}
        aria-hidden
      />
      <h1 className="[font-family:var(--font-merriweather)] !mt-4 text-center text-[18pt] font-normal leading-tight text-black">
        {title.trim() || "Unbenanntes Kapitel"}
      </h1>
      <div className="a5-heading-rule" style={{ alignSelf: "stretch" }} aria-hidden>
        <span className="a5-heading-rule__diamond" />
        <span className="a5-heading-rule__line" />
        <span className="a5-heading-rule__diamond" />
      </div>
    </div>
  );
}
