"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  channelUsesEmail,
  channelUsesSms,
  EMAIL_MAX_LENGTH,
  narrationIsActive,
  narrationIsRequired,
  narrationUsesCheckoutEmail,
  PHONE_MAX_LENGTH,
  type FieldErrors,
  type NarrationChannel,
  type WizardState,
} from "@/lib/onboarding/wizard";
import { ChoiceCard, FieldError } from "./wizard-ui";

const CHANNELS: ReadonlyArray<{ id: NarrationChannel; title: string }> = [
  { id: "email", title: "Per E-Mail" },
  { id: "sms", title: "Per SMS" },
  { id: "both", title: "Per E-Mail und SMS" },
];

type Props = {
  state: WizardState;
  errors: FieldErrors;
  isGuest: boolean;
  onChange: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
};

export function StepNarration({ state, errors, isGuest, onChange }: Props) {
  const isGift = state.forWhom === "gift";
  const name = state.giftRecipientName.trim();
  const required = narrationIsRequired(state);
  const active = narrationIsActive(state);
  const usesCheckoutEmail = narrationUsesCheckoutEmail(state, isGuest);

  const heading = required
    ? `Wie erreichen wir ${name}?`
    : isGift
      ? `Soll ${name} regelmäßig Erzähl-Impulse bekommen?`
      : "Möchten Sie regelmäßig Erzähl-Impulse bekommen?";

  // Ohne Portal-Zugang gibt es nur den Weg über die Sprachnachricht.
  const intro = required
    ? `${name} bekommt eine tiefgehende Leitfrage und kann die Antwort einfach per Sprachnachricht erzählen.`
    : isGift
      ? `${name} bekommt eine tiefgehende Leitfrage und kann die Antwort einfach per Sprachnachricht erzählen oder im Portal festhalten.`
      : "Sie bekommen eine tiefgehende Leitfrage und können die Antwort einfach per Sprachnachricht erzählen oder im Portal festhalten.";

  return (
    <div>
      <h2 className="heading-style-h3 mb-3 [overflow-wrap:anywhere]">{heading}</h2>
      <p className="mb-6 text-lg leading-7 text-[#4A453F] [overflow-wrap:anywhere]">{intro}</p>

      {!required && (
        <div className="mb-8 grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            selected={state.narrationEnabled}
            onClick={() => onChange("narrationEnabled", true)}
            title="Ja, gerne"
            description={
              isGift
                ? `${name} bekommt jede Woche einen Erzähl-Impuls.`
                : "Ich bekomme jede Woche einen Erzähl-Impuls."
            }
          />
          <ChoiceCard
            selected={!state.narrationEnabled}
            onClick={() => onChange("narrationEnabled", false)}
            title="Nein, danke"
            description={
              isGift
                ? `${name} nutzt zunächst nur den gängigen Projektzugang.`
                : "Ich nutze zunächst nur den gängigen Projektzugang."
            }
          />
        </div>
      )}

      {active && (
        <>
          <p className="mb-3 text-lg font-bold text-[#3E3831]">
            Wie sollen die Erzähl-Impulse ankommen?
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {CHANNELS.map((channel) => (
              <ChoiceCard
                key={channel.id}
                selected={state.narrationChannel === channel.id}
                onClick={() => onChange("narrationChannel", channel.id)}
                title={channel.title}
              />
            ))}
          </div>

          {channelUsesEmail(state.narrationChannel) &&
            (usesCheckoutEmail ? (
              <p className="mt-6 border border-[#e0dcd5] bg-[#FAF8F6] p-5 text-base leading-7 text-[#4A453F]">
                Die Erzähl-Impulse gehen an die E-Mail-Adresse, mit der Sie gleich bezahlen.
              </p>
            ) : (
              <div className="mt-6 grid gap-2">
                <Label htmlFor="narrationEmail">
                  {isGift ? `E-Mail-Adresse von ${name}` : "Ihre E-Mail-Adresse"}
                </Label>
                <Input
                  id="narrationEmail"
                  type="email"
                  inputMode="email"
                  maxLength={EMAIL_MAX_LENGTH}
                  autoComplete={isGift ? "off" : "email"}
                  value={state.narrationEmail}
                  onChange={(event) => onChange("narrationEmail", event.target.value)}
                  aria-invalid={!!errors.narrationEmail}
                  aria-describedby={errors.narrationEmail ? "narrationEmail-error" : undefined}
                  data-invalid={errors.narrationEmail ? "true" : undefined}
                  className="h-12 border-[#8E877E]"
                />
                <FieldError id="narrationEmail-error" message={errors.narrationEmail} />
              </div>
            ))}

          {channelUsesSms(state.narrationChannel) && (
            <div className="mt-6 grid gap-2">
              <Label htmlFor="narrationPhone">
                {isGift ? `Handynummer von ${name}` : "Ihre Handynummer"}
              </Label>
              <Input
                id="narrationPhone"
                type="tel"
                inputMode="tel"
                maxLength={PHONE_MAX_LENGTH}
                autoComplete={isGift ? "off" : "tel"}
                placeholder="+49 171 1234567"
                value={state.narrationPhone}
                onChange={(event) => onChange("narrationPhone", event.target.value)}
                aria-invalid={!!errors.narrationPhone}
                aria-describedby={
                  errors.narrationPhone
                    ? "narrationPhone-error narrationPhone-hint"
                    : "narrationPhone-hint"
                }
                data-invalid={errors.narrationPhone ? "true" : undefined}
                className="h-12 border-[#8E877E] placeholder:text-[#6B655E]"
              />
              <FieldError id="narrationPhone-error" message={errors.narrationPhone} />
              <p id="narrationPhone-hint" className="text-base leading-6 text-[#5F5A54]">
                Geben Sie die Nummer mit + und Ländervorwahl ein, zum Beispiel +49.
              </p>
            </div>
          )}

          <p className="mt-6 text-base leading-7 text-[#4A453F]">
            Die Erzähl-Impulse kommen jeden Sonntag. Der Rhythmus lässt sich später in der
            Projektübersicht ändern.
          </p>
        </>
      )}
    </div>
  );
}
