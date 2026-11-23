"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { Check, Loader2 } from "lucide-react";
import { BookView } from "@/components/cover/BookView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { startCheckoutAction } from "@/app/checkout/actions";
import { DEFAULT_THEME_ID } from "@/lib/cover-themes";
import type { CoverData } from "@/lib/cover-types";
import { loadOnboardingDraft, saveOnboardingDraft } from "@/lib/onboarding/draft";
import {
  INITIAL_WIZARD_STATE,
  buildSteps,
  changeForWhom,
  changeNarrationEmail,
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  channelUsesEmail,
  channelUsesSms,
  narrationIsActive,
  validateStep,
  type FieldErrors,
  type FieldKey,
  type ForWhom,
  type GiftMode,
  type RecipientRole,
  type StepId,
  type WizardContext,
  type WizardState,
} from "@/lib/onboarding/wizard";
import { StepNarration } from "./StepNarration";
import { ChoiceCard, FieldError } from "./wizard-ui";

// PROJ-24: Platzhalter für die Kaufseite. Sobald es echte Buchfotos gibt, wird
// nur dieses Motiv ausgetauscht (`imageUrl` zeigt ein Foto auf dem Cover).
const PURCHASE_BOOK: CoverData = {
  title: "Ihr Lebensbuch",
  subtitle: "",
  authorLine: "",
  themeId: DEFAULT_THEME_ID,
  colorId: "sand",
  imageUrl: null,
};

type WizardProps = {
  defaultFullName: string;
  buyerEmail: string;
  /** Konto, dem der Zwischenspeicher gehört. Bei Gästen `null`. */
  userId?: string | null;
  initialForWhom?: ForWhom | null;
  backUrl?: string;
  showPersonalAreaLink?: boolean;
  /**
   * Nicht angemeldet (Kauf ohne Konto, 2026-11-16): Der Checkout läuft
   * zuerst, das Konto wird direkt danach angelegt.
   */
  isGuest?: boolean;
};

const subscribeNever = () => () => {};

export function OnboardingWizard(props: WizardProps) {
  // Der Zwischenspeicher existiert nur im Browser. Das Formular startet deshalb
  // nach dem ersten Rendern einmal neu und liest ihn dann direkt ein.
  const inBrowser = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  return (
    <section className="relative flex min-h-screen flex-col overflow-hidden bg-[#FAF8F6] text-[#3E3831]">
      <div className="absolute inset-0" aria-hidden>
        <Image
          src="/images/onboarding-background-book.png"
          alt=""
          fill
          className="scale-[1.02] object-cover blur-[3px]"
          sizes="100vw"
          priority
        />
        <div className="absolute inset-0 bg-[#FAF8F6]/60" />
      </div>

      <header className="relative z-10 border-b border-[#e0dcd5] bg-[#FAF8F6] px-[5%] py-4">
        <div className="flex items-center gap-4">
          <Image src="/logo.svg" alt="" width={72} height={64} className="h-14 w-auto" priority />
          <span className="[font-family:var(--font-merriweather)] text-3xl font-normal leading-none tracking-[0.02em] text-[#2f3b30]">
            NARRAVIT
          </span>
        </div>
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center px-[5%] py-12 md:py-20">
        <div className="w-full max-w-3xl border border-[#e0dcd5] bg-white p-6 shadow-[0_18px_48px_rgba(62,56,49,0.12)] sm:p-10 md:p-12">
          <WizardForm key={inBrowser ? "browser" : "server"} {...props} restoreDraft={inBrowser} />
        </div>
      </div>
    </section>
  );
}

function createInitialState(
  defaultFullName: string,
  initialForWhom: ForWhom | null | undefined,
  context: WizardContext,
): WizardState {
  const base = { ...INITIAL_WIZARD_STATE, fullName: defaultFullName };
  return initialForWhom ? changeForWhom(base, initialForWhom, context) : base;
}

function restoreDraft(
  userId: string | null,
  initialForWhom: ForWhom | null | undefined,
  context: WizardContext,
): { state: WizardState; stepId: StepId } | null {
  const draft = loadOnboardingDraft(userId);
  if (!draft) return null;
  // Ein Link von der Website mit anderem Weg geht vor.
  if (initialForWhom && draft.state.forWhom !== initialForWhom) return null;
  // Gast hat sich mittendrin angemeldet: Jetzt ist die eigene Adresse bekannt.
  const needsOwnEmail =
    draft.state.forWhom === "self" && !context.isGuest && !draft.state.narrationEmail.trim();
  return {
    stepId: draft.stepId,
    state: needsOwnEmail
      ? { ...draft.state, narrationEmail: context.buyerEmail }
      : draft.state,
  };
}

function WizardForm({
  defaultFullName,
  buyerEmail,
  userId = null,
  initialForWhom,
  backUrl = "https://www.narravit.de",
  showPersonalAreaLink = false,
  isGuest = false,
  restoreDraft: shouldRestore,
}: WizardProps & { restoreDraft: boolean }) {
  const context = useMemo<WizardContext>(() => ({ buyerEmail, isGuest }), [buyerEmail, isGuest]);
  const shouldSkipForWhomStep = initialForWhom !== null && initialForWhom !== undefined;

  const [initial] = useState(() => {
    const restored = shouldRestore ? restoreDraft(userId, initialForWhom, context) : null;
    const state = restored?.state ?? createInitialState(defaultFullName, initialForWhom, context);
    const index = restored ? buildSteps(state, shouldSkipForWhomStep).indexOf(restored.stepId) : 0;
    return { state, stepIndex: Math.max(index, 0) };
  });
  const [state, setState] = useState<WizardState>(initial.state);
  const [stepIndex, setStepIndex] = useState(initial.stepIndex);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const formRef = useRef<HTMLDivElement>(null);
  const previousStep = useRef(initial.stepIndex);

  const steps = useMemo(
    () => buildSteps(state, shouldSkipForWhomStep),
    [state, shouldSkipForWhomStep],
  );
  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const currentStep = steps[safeIndex]!;
  const isLast = safeIndex === steps.length - 1;
  const isFirst = safeIndex === 0;

  useEffect(() => {
    if (!shouldRestore) return;
    saveOnboardingDraft(userId, { stepId: currentStep, state });
  }, [shouldRestore, userId, currentStep, state]);

  useEffect(() => {
    if (focusRequest === 0) return;
    formRef.current?.querySelector<HTMLElement>('[data-invalid="true"]')?.focus();
  }, [focusRequest]);

  useEffect(() => {
    if (previousStep.current === safeIndex) return;
    previousStep.current = safeIndex;
    window.scrollTo({ top: 0 });
  }, [safeIndex]);

  // Rückkehr von Stripe über den Browser: Die eingefrorene Seite könnte einen
  // gesperrten Kauf-Button zeigen. Neu laden holt den Stand aus dem Speicher.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const next = () => {
    const errors = validateStep(currentStep, state, context);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFocusRequest((value) => value + 1);
      return;
    }
    setFieldErrors({});
    setError(null);
    setStepIndex(Math.min(safeIndex + 1, steps.length - 1));
  };

  const back = () => {
    setFieldErrors({});
    setError(null);
    setStepIndex(Math.max(safeIndex - 1, 0));
  };

  const update = <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((current) => {
      if (key === "forWhom") return changeForWhom(current, value as ForWhom, context);
      if (key === "narrationEmail") return changeNarrationEmail(current, value as string);
      const nextState = { ...current, [key]: value };
      if (key === "buyerWantsAccess" && value === false) {
        nextState.giftRecipientRole = "projektleiter";
      }
      return nextState;
    });
    setFieldErrors((current) => {
      if (key === "narrationChannel" || key === "narrationEnabled") return {};
      const nextErrors = { ...current };
      delete nextErrors[key as FieldKey];
      return nextErrors;
    });
    setError(null);
  };

  const [isPending, startTransition] = useTransition();
  const handlePurchase = () => {
    setError(null);
    const isGift = state.forWhom === "gift";
    const withComputer = isGift && state.giftMode === "phone-plus-computer";
    startTransition(async () => {
      const res = await startCheckoutAction({
        productType: "initial",
        metadata: {
          fullName: state.fullName,
          isGift,
          giftRecipientName: isGift ? state.giftRecipientName || undefined : undefined,
          giftRecipientEmail: withComputer ? state.giftRecipientEmail || undefined : undefined,
          giftMode: isGift ? (state.giftMode ?? undefined) : undefined,
          giftRecipientRole: state.giftRecipientRole,
          buyerRetainsAccess: withComputer ? state.buyerWantsAccess : true,
          narration: {
            enabled: narrationIsActive(state),
            channel: state.narrationChannel,
            email: channelUsesEmail(state.narrationChannel) ? state.narrationEmail : undefined,
            phone: channelUsesSms(state.narrationChannel) ? state.narrationPhone : undefined,
          },
        },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Stripe Hosted Checkout — Vollredirect (kein router.push, sonst
      // ratet Next.js die Route als interne Navigation).
      window.location.href = res.checkoutUrl;
    });
  };

  return (
    <div ref={formRef}>
      <ProgressBar total={steps.length} current={safeIndex} />

      <div className="mt-8">
        {currentStep === "name" && (
          <StepName
            fullName={state.fullName}
            error={fieldErrors.fullName}
            onChange={(value) => update("fullName", value)}
          />
        )}
        {currentStep === "for-whom" && (
          <StepForWhom
            value={state.forWhom}
            error={fieldErrors.forWhom}
            onChange={(value) => update("forWhom", value)}
          />
        )}
        {currentStep === "gift-details" && (
          <StepGiftDetails
            recipientName={state.giftRecipientName}
            giftMode={state.giftMode}
            nameError={fieldErrors.giftRecipientName}
            modeError={fieldErrors.giftMode}
            onChangeName={(value) => update("giftRecipientName", value)}
            onChangeMode={(value) => update("giftMode", value)}
          />
        )}
        {currentStep === "narration" && (
          <StepNarration state={state} errors={fieldErrors} isGuest={isGuest} onChange={update} />
        )}
        {currentStep === "gift-computer" && (
          <StepGiftComputer
            email={state.giftRecipientEmail}
            emailError={fieldErrors.giftRecipientEmail}
            role={state.giftRecipientRole}
            buyerWantsAccess={state.buyerWantsAccess}
            onChangeEmail={(value) => update("giftRecipientEmail", value)}
            onChangeRole={(value) => update("giftRecipientRole", value)}
            onChangeBuyerAccess={(value) => update("buyerWantsAccess", value)}
          />
        )}
        {currentStep === "purchase" && <StepPurchase state={state} isGuest={isGuest} />}
      </div>

      {error && (
        <p className="mt-4 text-base font-bold text-[#9C1C1C]" role="alert">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:gap-4">
        {isFirst ? (
          <Button asChild variant="outline" className="h-12 w-full text-lg sm:w-auto sm:min-w-32">
            <a href={backUrl}>Zurück</a>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={back}
            className="h-12 w-full text-lg sm:w-auto sm:min-w-32"
          >
            Zurück
          </Button>
        )}

        {isLast ? (
          <Button
            type="button"
            onClick={handlePurchase}
            disabled={isPending}
            className="h-12 w-full text-lg sm:w-auto sm:min-w-44"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wird vorbereitet …
              </>
            ) : (
              "Jetzt kaufen — 249 €"
            )}
          </Button>
        ) : (
          <Button type="button" onClick={next} className="h-12 w-full text-lg sm:w-auto sm:min-w-32">
            Weiter
          </Button>
        )}
      </div>

      {isGuest && (
        <p className="mt-8 border-t border-[#e0dcd5] pt-4 text-center text-base text-[#5F5A54]">
          Sie haben bereits ein Konto?{" "}
          <a
            href="/anmelden?next=%2Fonboarding"
            className="inline-flex min-h-11 items-center text-[#3E3831] underline underline-offset-4 hover:no-underline"
          >
            Anmelden
          </a>
        </p>
      )}

      {showPersonalAreaLink && (
        <p className="mt-8 border-t border-[#e0dcd5] pt-4 text-center text-base">
          <a
            href="/persoenlicher-bereich"
            className="inline-flex min-h-11 items-center text-[#3E3831] underline underline-offset-4 hover:no-underline"
          >
            Zum persönlichen Bereich
          </a>
        </p>
      )}
    </div>
  );
}

function ProgressBar({ total, current }: { total: number; current: number }) {
  return (
    <>
      <p className="sr-only">
        Schritt {current + 1} von {total}
      </p>
      <div
        aria-hidden
        className="relative mx-auto flex w-fit max-w-full justify-center gap-1.5 before:absolute before:left-4 before:right-4 before:top-1/2 before:z-0 before:h-px before:-translate-y-1/2 before:bg-[#BDB5AA] sm:gap-8 sm:before:left-5 sm:before:right-5"
      >
        {Array.from({ length: total }, (_, index) => (
          <div
            key={index}
            className={cn(
              "relative z-10 flex h-8 w-8 items-center justify-center border text-base font-bold sm:h-10 sm:w-10",
              current >= index
                ? "border-[#96B897] bg-[#96B897] text-[#1F2A20]"
                : "border-[#BDB5AA] bg-white text-[#5F5A54]",
            )}
          >
            {current > index ? <Check className="h-4 w-4 sm:h-5 sm:w-5" /> : index + 1}
          </div>
        ))}
      </div>
    </>
  );
}

function StepName({
  fullName,
  error,
  onChange,
}: {
  fullName: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <h2 className="heading-style-h3 mb-6">Wie heißen Sie?</h2>
      <div className="grid gap-2">
        <Label htmlFor="fullName">Vor- und Nachnamen</Label>
        <Input
          id="fullName"
          type="text"
          maxLength={NAME_MAX_LENGTH}
          value={fullName}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="name"
          aria-invalid={!!error}
          aria-describedby={error ? "fullName-error" : undefined}
          data-invalid={error ? "true" : undefined}
          className="h-12 border-[#8E877E]"
          autoFocus
        />
        <FieldError id="fullName-error" message={error} />
      </div>
    </div>
  );
}

function StepForWhom({
  value,
  error,
  onChange,
}: {
  value: ForWhom | null;
  error?: string;
  onChange: (value: ForWhom) => void;
}) {
  return (
    <div>
      <h2 className="heading-style-h3 mb-3">Für wen ist das Lebensbuch?</h2>
      <p className="mb-6 text-lg leading-7 text-[#4A453F]">
        Sie können es für sich selbst anlegen oder als Geschenk für jemanden.
      </p>
      <div
        className="grid gap-3 outline-none"
        tabIndex={error ? -1 : undefined}
        data-invalid={error ? "true" : undefined}
      >
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
      <FieldError id="forWhom-error" message={error} />
    </div>
  );
}

function StepGiftDetails({
  recipientName,
  giftMode,
  nameError,
  modeError,
  onChangeName,
  onChangeMode,
}: {
  recipientName: string;
  giftMode: GiftMode | null;
  nameError?: string;
  modeError?: string;
  onChangeName: (value: string) => void;
  onChangeMode: (value: GiftMode) => void;
}) {
  return (
    <div>
      <h2 className="heading-style-h3 mb-6">Für wen ist das Geschenk?</h2>

      <div className="grid gap-2">
        <Label htmlFor="recipientName">Name der beschenkten Person</Label>
        <Input
          id="recipientName"
          type="text"
          maxLength={NAME_MAX_LENGTH}
          value={recipientName}
          onChange={(event) => onChangeName(event.target.value)}
          aria-invalid={!!nameError}
          aria-describedby={nameError ? "recipientName-error" : undefined}
          data-invalid={nameError ? "true" : undefined}
          className="h-12 border-[#8E877E]"
          autoFocus
        />
        <FieldError id="recipientName-error" message={nameError} />
      </div>

      <p className="mb-3 mt-8 text-lg font-bold text-[#3E3831]">Wie soll erzählt werden?</p>
      <div
        className="grid gap-3 outline-none"
        tabIndex={modeError ? -1 : undefined}
        data-invalid={modeError ? "true" : undefined}
      >
        <ChoiceCard
          selected={giftMode === "phone-only"}
          onClick={() => onChangeMode("phone-only")}
          title="Nur per Sprachnachricht erzählen"
          description="Die beschenkte Person bekommt jede Woche einen Erzähl-Impuls und erzählt per Sprachnachricht. Wir machen daraus den Text. Das ist vor allem für Personen geeignet, denen der Umgang mit dem Computer schwerfällt."
        />
        <ChoiceCard
          selected={giftMode === "phone-plus-computer"}
          onClick={() => onChangeMode("phone-plus-computer")}
          title="Auch am Computer schreiben"
          description="Die beschenkte Person kann zusätzlich selbst im Portal schreiben."
        />
      </div>
      <FieldError id="giftMode-error" message={modeError} />

      {giftMode === "phone-only" && (
        <p className="mt-6 border border-[#e0dcd5] bg-[#FAF8F6] p-5 text-base leading-7 text-[#4A453F]">
          Hinweis: Sie erhalten als Käufer vollen Zugriff auf das Projekt (Projektleiter).
        </p>
      )}
    </div>
  );
}

function StepGiftComputer({
  email,
  emailError,
  role,
  buyerWantsAccess,
  onChangeEmail,
  onChangeRole,
  onChangeBuyerAccess,
}: {
  email: string;
  emailError?: string;
  role: RecipientRole;
  buyerWantsAccess: boolean;
  onChangeEmail: (value: string) => void;
  onChangeRole: (value: RecipientRole) => void;
  onChangeBuyerAccess: (value: boolean) => void;
}) {
  return (
    <div>
      <h2 className="heading-style-h3 mb-3">Zugang einrichten</h2>
      <p className="mb-6 text-lg leading-7 text-[#4A453F]">
        Wir senden das Geschenk per E-Mail an die beschenkte Person.
      </p>

      <div className="grid gap-2">
        <Label htmlFor="recipientEmail">E-Mail der beschenkten Person</Label>
        <Input
          id="recipientEmail"
          type="email"
          maxLength={EMAIL_MAX_LENGTH}
          value={email}
          onChange={(event) => onChangeEmail(event.target.value)}
          aria-invalid={!!emailError}
          aria-describedby={emailError ? "recipientEmail-error" : undefined}
          data-invalid={emailError ? "true" : undefined}
          className="h-12 border-[#8E877E]"
          autoFocus
        />
        <FieldError id="recipientEmail-error" message={emailError} />
      </div>

      <div className="mt-8 flex items-center justify-between gap-4 border border-[#e0dcd5] bg-[#FAF8F6] p-5">
        <div className="min-w-0">
          <p className="text-lg font-bold">Möchten Sie selbst Zugang zum Projekt?</p>
          <p className="mt-1 text-base leading-6 text-[#4A453F]">
            Wenn ja, werden Sie als Projektleiter eingetragen.
          </p>
        </div>
        <Switch
          checked={buyerWantsAccess}
          onCheckedChange={onChangeBuyerAccess}
          aria-label="Selbst Zugang zum Projekt erhalten"
          className="h-11 w-20 rounded-none data-[state=checked]:bg-[#557559] data-[state=unchecked]:bg-[#77716A] [&>span]:h-10 [&>span]:w-10 [&>span]:rounded-none [&>span]:bg-white [&>span]:data-[state=checked]:translate-x-9"
        />
      </div>

      <p className="mb-3 mt-8 text-lg font-bold text-[#3E3831]">Rolle der beschenkten Person</p>
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
        <p className="mt-4 border border-[#e0dcd5] bg-[#FAF8F6] p-5 text-base leading-7 text-[#4A453F]">
          Da Sie selbst keinen Zugang möchten, wird die beschenkte Person automatisch Projektleiter,
          denn jedes Projekt braucht eine Projektleitung.
        </p>
      )}
    </div>
  );
}

function StepPurchase({ state, isGuest }: { state: WizardState; isGuest: boolean }) {
  const isGift = state.forWhom === "gift";
  const withComputer = isGift && state.giftMode === "phone-plus-computer";
  const summary: { label: string; value: string }[] = [
    { label: "Ihr Name", value: state.fullName },
    { label: "Für wen", value: isGift ? "Als Geschenk" : "Für mich selbst" },
  ];

  if (isGift) summary.push({ label: "Beschenkte Person", value: state.giftRecipientName });
  if (withComputer) {
    summary.push({ label: "E-Mail für das Geschenk", value: state.giftRecipientEmail });
  }

  // Geschenk ohne eigenen Zugang: Ohne Anmeldung ist gar kein Konto nötig.
  const isDirectGift = isGuest && withComputer && !state.buyerWantsAccess;

  return (
    <div>
      <h2 className="heading-style-h3 mb-3">Bereit zum Start?</h2>
      <p className="mb-6 text-lg leading-7 text-[#4A453F]">
        {isDirectGift
          ? "Nach der Zahlung senden wir das Geschenk direkt an die beschenkte Person. Ein Konto brauchen Sie dafür nicht."
          : isGuest
            ? "Nach der Zahlung legen Sie in einem kurzen Schritt Ihr Konto an — danach können Sie sofort loslegen."
            : "Mit dem Kauf schalten wir Ihr Projekt frei und Sie können sofort loslegen."}
      </p>

      <dl className="mb-8 grid gap-4 border border-[#e0dcd5] bg-white p-4 sm:gap-3 sm:p-6">
        {summary.map(({ label, value }) => (
          <div key={label} className="grid gap-1 text-base sm:flex sm:justify-between sm:gap-5">
            <dt className="shrink-0 text-[#5F5A54]">{label}</dt>
            <dd className="min-w-0 font-bold [overflow-wrap:anywhere] sm:text-right">
              {value || "—"}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col border border-[#e0dcd5] sm:flex-row">
        <div className="flex items-center justify-center overflow-hidden bg-[#EFEAE3] px-6 py-7 sm:w-56 sm:shrink-0">
          <BookView data={PURCHASE_BOOK} className="max-w-[150px]" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center bg-[#FAF8F6] p-5 sm:p-7">
          <p className="heading-style-h4">249 €</p>
          <p className="mt-2 text-lg leading-7 text-[#3E3831]">
            Ihr erstes gedrucktes Hardcover-Buch, 12 Monate Projektzugang, Erzählen per
            Sprachnachricht und Editor.
          </p>
        </div>
      </div>
    </div>
  );
}
