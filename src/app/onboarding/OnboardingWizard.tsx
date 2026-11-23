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
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startCheckoutAction } from "@/app/checkout/actions";
import { loadOnboardingDraft, saveOnboardingDraft } from "@/lib/onboarding/draft";
import {
  INITIAL_WIZARD_STATE,
  buildSteps,
  changeForWhom,
  changeNarrationEmail,
  channelUsesEmail,
  channelUsesSms,
  narrationIsActive,
  validateStep,
  type FieldErrors,
  type FieldKey,
  type ForWhom,
  type StepId,
  type WizardContext,
  type WizardState,
} from "@/lib/onboarding/wizard";
import { StepNarration } from "./StepNarration";
import { ProgressBar, StepName, StepForWhom, StepGiftDetails, StepGiftComputer, StepPurchase } from "./WizardSteps";

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
