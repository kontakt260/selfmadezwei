import { BackdropScreen } from "@/components/BackdropScreen";
import { SuccessIcon } from "./SuccessIcon";

// Abschluss beim Geschenk ohne eigenen Zugang: Das Geschenk ist verschickt,
// der Käufer braucht kein Konto.

export function DirectGiftScreen({
  recipientEmail,
  buyerEmail,
}: {
  recipientEmail: string;
  buyerEmail: string;
}) {
  return (
    <BackdropScreen backdrop="geschenk">
      <div className="flex flex-col items-center gap-6 text-center">
        <SuccessIcon />
        <h1 className="text-2xl font-normal text-[#3E3831] sm:text-3xl">
          Vielen Dank – Ihre Zahlung ist eingegangen und Ihr Geschenk ist unterwegs
        </h1>
        <p className="text-base leading-7 text-[#535252] sm:text-lg sm:leading-8">
          Wir haben das Geschenk verschickt.
        </p>
        <p className="w-full break-words border border-[#96B897]/40 bg-[#96B897]/10 p-4 text-base text-[#3E3831]">
          Geschenk unterwegs an <span className="font-semibold">{recipientEmail || "die beschenkte Person"}</span>
        </p>
        <p className="text-base leading-7 text-[#535252]">
          Für Sie ist nichts weiter zu tun, ein Konto brauchen Sie nicht.
          {buyerEmail ? (
            <>
              {" "}
              Die Kaufbestätigung haben wir an{" "}
              <span className="break-all font-semibold">{buyerEmail}</span> geschickt.
            </>
          ) : null}
        </p>
      </div>
    </BackdropScreen>
  );
}
