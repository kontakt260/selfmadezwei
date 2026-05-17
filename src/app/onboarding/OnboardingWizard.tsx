"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type ForWhom = "self" | "gift";
type GiftMode = "phone-only" | "phone-plus-computer";
type RecipientRole = "projektleiter" | "co_author";

type WizardState = {
  fullName: string;
  forWhom: ForWhom | null;
  giftRecipientName: string;
  giftMode: GiftMode | null;
  giftRecipientEmail: string;
  giftRecipientRole: RecipientRole;
  buyerWantsAccess: boolean;
};

type StepId = "name" | "for-whom" | "gift-details" | "gift-computer" | "purchase";

const INITIAL_STATE: WizardState = {
  fullName: "",
  forWhom: null,
  giftRecipientName: "",
  giftMode: null,
  giftRecipientEmail: "",
  giftRecipientRole: "co_author",
  buyerWantsAccess: true,
};

export function OnboardingWizard({
  defaultFullName,
  buyerEmail,
  initialForWhom,
  backUrl = "https://www.narravit.de",
}: {
  defaultFullName: string;
  buyerEmail: string;
  initialForWhom?: ForWhom | null;
  backUrl?: string;
}) {
  const [state, setState] = useState<WizardState>({
    ...INITIAL_STATE,
    fullName: defaultFullName,
    forWhom: initialForWhom ?? null,
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const shouldSkipForWhomStep = initialForWhom !== null && initialForWhom !== undefined;

  const steps = useMemo<StepId[]>(() => {
    const base: StepId[] = shouldSkipForWhomStep ? ["name"] : ["for-whom", "name"];
    if (state.forWhom === "gift") {
      base.push("gift-details");
      if (state.giftMode === "phone-plus-computer") {
        base.push("gift-computer");
      }
    }
    base.push("purchase");
    return base;
  }, [shouldSkipForWhomStep, state.forWhom, state.giftMode]);

  const currentStep = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const isFirst = stepIndex === 0;

  const validateCurrent = (): string | null => {
    switch (currentStep) {
      case "name":
        if (state.fullName.trim().length < 2) return "Bitte deinen Namen angeben (mind. 2 Zeichen).";
        return null;
      case "for-whom":
        if (!state.forWhom) return "Bitte triff eine Auswahl.";
        return null;
      case "gift-details":
        if (state.giftRecipientName.trim().length < 2) return "Name der beschenkten Person fehlt.";
        if (!state.giftMode) return "Bitte wähle, wie geschrieben werden soll.";
        return null;
      case "gift-computer": {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(state.giftRecipientEmail)) {
          return "Bitte eine gültige E-Mail-Adresse angeben.";
        }
        if (
          state.giftRecipientEmail.trim().toLowerCase() === buyerEmail.trim().toLowerCase()
        ) {
          return "Bitte eine andere E-Mail-Adresse angeben.";
        }
        return null;
      }
      default:
        return null;
    }
  };

  const next = () => {
    const err = validateCurrent();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const back = () => {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const update = <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((s) => {
      const nextState = { ...s, [key]: value };
      if (key === "buyerWantsAccess" && value === false) {
        nextState.giftRecipientRole = "projektleiter";
      }
      return nextState;
    });
    setError(null);
  };

  const handlePurchase = () => {
    setError("Stripe-Checkout wird in PROJ-6 implementiert.");
  };

  return (
    <section className="flex min-h-screen flex-col bg-[#FAF8F6] text-[#3E3831]">
      <header className="border-b border-[#e0dcd5] px-[5%] py-4">
        <div className="flex items-center gap-4">
          <Image src="/logo.svg" alt="" width={72} height={64} className="h-14 w-auto" priority />
          <span className="[font-family:var(--font-merriweather)] text-3xl font-normal leading-none tracking-[0.02em] text-[#2f3b30]">
            NARRAVIT
          </span>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-[5%] py-12 md:py-20">
        <div className="w-full max-w-3xl border border-[#e0dcd5] bg-white p-7 sm:p-10 md:p-12">
          <ProgressBar total={steps.length} current={stepIndex} />

          <div className="mt-8">
            {currentStep === "name" && (
              <StepName fullName={state.fullName} onChange={(v) => update("fullName", v)} />
            )}
            {currentStep === "for-whom" && (
              <StepForWhom value={state.forWhom} onChange={(v) => update("forWhom", v)} />
            )}
            {currentStep === "gift-details" && (
              <StepGiftDetails
                recipientName={state.giftRecipientName}
                giftMode={state.giftMode}
                onChangeName={(v) => update("giftRecipientName", v)}
                onChangeMode={(v) => update("giftMode", v)}
              />
            )}
            {currentStep === "gift-computer" && (
              <StepGiftComputer
                email={state.giftRecipientEmail}
                role={state.giftRecipientRole}
                buyerWantsAccess={state.buyerWantsAccess}
                onChangeEmail={(v) => update("giftRecipientEmail", v)}
                onChangeRole={(v) => update("giftRecipientRole", v)}
                onChangeBuyerAccess={(v) => update("buyerWantsAccess", v)}
              />
            )}
            {currentStep === "purchase" && <StepPurchase state={state} />}
          </div>

          {error && (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:gap-4">
            {isFirst ? (
              <Button asChild variant="outline" className="h-12 w-full sm:w-auto sm:min-w-32">
                <a href={backUrl}>Zurück</a>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={back}
                className="h-12 w-full sm:w-auto sm:min-w-32"
              >
                Zurück
              </Button>
            )}

            {isLast ? (
              <Button type="button" onClick={handlePurchase} className="h-12 w-full sm:w-auto sm:min-w-44">
                Jetzt kaufen — 249 €
              </Button>
            ) : (
              <Button type="button" onClick={next} className="h-12 w-full sm:w-auto sm:min-w-32">
                Weiter
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProgressBar({ total, current }: { total: number; current: number }) {
  return (
    <div className="relative mx-auto flex w-fit max-w-full justify-center gap-2 before:absolute before:left-4 before:right-4 before:top-1/2 before:z-0 before:h-px before:-translate-y-1/2 before:bg-[#e0dcd5] sm:gap-8 sm:before:left-5 sm:before:right-5">
      {Array.from({ length: total }, (_, index) => (
        <div
          key={index}
          className={cn(
            "relative z-10 flex h-8 w-8 items-center justify-center border text-sm font-bold sm:h-10 sm:w-10 sm:text-base",
            current >= index
              ? "border-[#96B897] bg-[#96B897] text-white"
              : "border-[#e0dcd5] bg-white text-[#848484]",
          )}
        >
          {current > index ? <Check className="h-4 w-4 sm:h-5 sm:w-5" /> : index + 1}
        </div>
      ))}
    </div>
  );
}

function StepName({
  fullName,
  onChange,
}: {
  fullName: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <h2 className="heading-style-h3 mb-3">Wie heißt du?</h2>
      <p className="mb-6 text-[#535252]">
        Dein Name erscheint später in deinem Profil und im Buch.
      </p>
      <div className="grid gap-2">
        <Label htmlFor="fullName">Vollständiger Name</Label>
        <Input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="name"
          className="h-12"
          autoFocus
        />
      </div>
    </div>
  );
}

function StepForWhom({
  value,
  onChange,
}: {
  value: ForWhom | null;
  onChange: (value: ForWhom) => void;
}) {
  return (
    <div>
      <h2 className="heading-style-h3 mb-3">Für wen ist das Lebensbuch?</h2>
      <p className="mb-6 text-[#535252]">
        Du kannst es für dich selbst anlegen oder als Geschenk für jemanden.
      </p>
      <div className="grid gap-3">
        <ChoiceCard
          selected={value === "self"}
          onClick={() => onChange("self")}
          title="Für mich selbst"
          description="Ich möchte mein eigenes Lebensbuch schreiben."
        />
        <ChoiceCard
          selected={value === "gift"}
          onClick={() => onChange("gift")}
          title="Als Geschenk"
          description="Ich schenke jemand anderem ein Lebensbuch."
        />
      </div>
    </div>
  );
}

function StepGiftDetails({
  recipientName,
  giftMode,
  onChangeName,
  onChangeMode,
}: {
  recipientName: string;
  giftMode: GiftMode | null;
  onChangeName: (value: string) => void;
  onChangeMode: (value: GiftMode) => void;
}) {
  return (
    <div>
      <h2 className="heading-style-h3 mb-3">Für wen ist das Geschenk?</h2>
      <p className="mb-6 text-[#535252]">
        Erzähl uns ein bisschen über die beschenkte Person.
      </p>

      <div className="grid gap-2">
        <Label htmlFor="recipientName">Name der beschenkten Person</Label>
        <Input
          id="recipientName"
          type="text"
          value={recipientName}
          onChange={(e) => onChangeName(e.target.value)}
          className="h-12"
          autoFocus
        />
      </div>

      <p className="mt-8 mb-3 text-sm font-medium">Wie soll erzählt werden?</p>
      <div className="grid gap-3">
        <ChoiceCard
          selected={giftMode === "phone-only"}
          onClick={() => onChangeMode("phone-only")}
          title="Nur per Telefon erzählen"
          description="Die beschenkte Person ruft an und erzählt — wir transkribieren."
        />
        <ChoiceCard
          selected={giftMode === "phone-plus-computer"}
          onClick={() => onChangeMode("phone-plus-computer")}
          title="Auch am Computer schreiben"
          description="Die beschenkte Person kann zusätzlich selbst im Portal schreiben."
        />
      </div>

      {giftMode === "phone-only" && (
        <p className="mt-6 border border-[#e0dcd5] bg-[#FAF8F6] p-5 text-base text-[#535252]">
          Hinweis: Du erhältst als Käufer vollen Zugriff auf das Projekt (Projektleiter).
        </p>
      )}
    </div>
  );
}

function StepGiftComputer({
  email,
  role,
  buyerWantsAccess,
  onChangeEmail,
  onChangeRole,
  onChangeBuyerAccess,
}: {
  email: string;
  role: RecipientRole;
  buyerWantsAccess: boolean;
  onChangeEmail: (value: string) => void;
  onChangeRole: (value: RecipientRole) => void;
  onChangeBuyerAccess: (value: boolean) => void;
}) {
  return (
    <div>
      <h2 className="heading-style-h3 mb-3">Zugang einrichten</h2>
      <p className="mb-6 text-[#535252]">
        Wir laden die beschenkte Person per E-Mail in das Projekt ein.
      </p>

      <div className="grid gap-2">
        <Label htmlFor="recipientEmail">E-Mail der beschenkten Person</Label>
        <Input
          id="recipientEmail"
          type="email"
          value={email}
          onChange={(e) => onChangeEmail(e.target.value)}
          className="h-12"
          autoFocus
        />
      </div>

      <div className="mt-8 flex items-start justify-between border border-[#e0dcd5] bg-[#FAF8F6] p-5">
        <div className="pr-6">
          <p className="font-medium">Möchtest du selbst Zugang zum Projekt?</p>
          <p className="mt-1 text-base text-[#535252]">
            Wenn ja, wirst du als Projektleiter eingetragen.
          </p>
        </div>
        <Switch checked={buyerWantsAccess} onCheckedChange={onChangeBuyerAccess} />
      </div>

      <p className="mt-8 mb-3 text-sm font-medium">Rolle der beschenkten Person</p>
      <div className="grid gap-3">
        <ChoiceCard
          selected={role === "projektleiter"}
          onClick={() => onChangeRole("projektleiter")}
          title="Projektleiter"
          description="Darf das Projekt löschen und den finalen Druckauftrag erteilen."
        />
        <ChoiceCard
          selected={role === "co_author"}
          onClick={() => onChangeRole("co_author")}
          disabled={!buyerWantsAccess}
          title="Co-Autor"
          description="Darf schreiben und Kapitel bearbeiten."
        />
      </div>

      {!buyerWantsAccess && (
        <p className="mt-4 border border-[#e0dcd5] bg-[#FAF8F6] p-5 text-base text-[#535252]">
          Da du selbst keinen Zugang möchtest, wird die beschenkte Person automatisch Projektleiter
          — jedes Projekt braucht mindestens eine:n Projektleiter:in.
        </p>
      )}
    </div>
  );
}

function StepPurchase({ state }: { state: WizardState }) {
  const summary: { label: string; value: string }[] = [
    { label: "Name", value: state.fullName },
    {
      label: "Geschenk?",
      value: state.forWhom === "gift" ? "Als Geschenk" : "Für mich selbst",
    },
  ];

  if (state.forWhom === "gift") {
    summary.push({ label: "Beschenkte Person", value: state.giftRecipientName });
    summary.push({
      label: "Erzählweise",
      value: state.giftMode === "phone-only" ? "Nur Telefon" : "Auch Computer",
    });
    if (state.giftMode === "phone-plus-computer") {
      summary.push({ label: "E-Mail Beschenkte:r", value: state.giftRecipientEmail });
      summary.push({
        label: "Rolle Beschenkte:r",
        value: state.giftRecipientRole === "projektleiter" ? "Projektleiter" : "Co-Autor",
      });
      summary.push({
        label: "Eigener Zugang",
        value: state.buyerWantsAccess ? "Ja (Projektleiter)" : "Nein",
      });
    } else {
      summary.push({ label: "Dein Zugang", value: "Projektleiter (Standard)" });
    }
  }

  return (
    <div>
      <h2 className="heading-style-h3 mb-3">Bereit zum Start?</h2>
      <p className="mb-6 text-[#535252]">
        Mit dem Kauf schalten wir dein Projekt frei und du kannst sofort loslegen.
      </p>

      <dl className="mb-8 grid gap-4 border border-[#e0dcd5] bg-white p-4 sm:gap-3 sm:p-6">
        {summary.map(({ label, value }) => (
          <div
            key={label}
            className="grid gap-1 text-base sm:flex sm:justify-between sm:gap-5"
          >
            <dt className="text-[#848484]">{label}</dt>
            <dd className="min-w-0 break-words font-medium sm:text-right">{value || "—"}</dd>
          </div>
        ))}
      </dl>

      <div className="border border-[#e0dcd5] bg-[#FAF8F6] p-5 sm:p-7">
        <p className="text-base text-[#848484]">12 Monate Portal-Zugang</p>
        <p className="heading-style-h4 mt-1">249 €</p>
        <p className="mt-2 text-base text-[#535252]">
          Inklusive 10 Stunden Vapi-Erzählzeit, Editor und Druck-Vorbereitung.
        </p>
      </div>
    </div>
  );
}

function ChoiceCard({
  selected,
  onClick,
  title,
  description,
  disabled = false,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full border p-5 text-left [font-family:var(--font-lato)] text-lg font-bold transition-colors",
        selected
          ? "border-[#96B897] bg-[#F3F7F3]"
          : "border-[#e0dcd5] bg-white hover:border-[#96B897]",
        disabled && "cursor-not-allowed opacity-50 hover:border-[#e0dcd5]",
      )}
    >
      <p>{title}</p>
      <p className="mt-2 text-base font-normal text-[#535252]">{description}</p>
    </button>
  );
}
