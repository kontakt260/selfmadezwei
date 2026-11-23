"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PHONE_COUNTRIES,
  channelUsesEmail,
  channelUsesSms,
  narrationIsActive,
  narrationIsRequired,
  narrationUsesCheckoutEmail,
  isPhoneCountry,
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

  return (
    <div>
      <h2 className="heading-style-h3 mb-3 [overflow-wrap:anywhere]">{heading}</h2>
      <p className="mb-6 text-lg leading-7 text-[#4A453F]">
        {isGift
          ? `${name} bekommt eine Frage aus dem eigenen Leben und kann die Antwort einfach per Sprachnachricht erzählen.`
          : "Sie bekommen eine Frage aus Ihrem Leben und können die Antwort einfach per Sprachnachricht erzählen."}
      </p>

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
              isGift ? `${name} schreibt nur am Computer.` : "Ich möchte nur selbst schreiben."
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
              <div className="flex flex-col gap-3 sm:flex-row">
                <Select
                  value={state.narrationPhoneCountry}
                  onValueChange={(value) => {
                    if (isPhoneCountry(value)) onChange("narrationPhoneCountry", value);
                  }}
                >
                  <SelectTrigger
                    aria-label="Ländervorwahl"
                    className="h-12 w-full border-[#8E877E] bg-white text-base sm:w-56 sm:shrink-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PHONE_COUNTRIES.map((country) => (
                      <SelectItem
                        key={country.id}
                        value={country.id}
                        className="min-h-11 py-2 text-base focus:bg-[#EFEBE5] focus:text-[#1F1C19]"
                      >
                        {country.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="narrationPhone"
                  type="tel"
                  inputMode="tel"
                  autoComplete={isGift ? "off" : "tel"}
                  placeholder="0171 1234567"
                  value={state.narrationPhone}
                  onChange={(event) => onChange("narrationPhone", event.target.value)}
                  aria-invalid={!!errors.narrationPhone}
                  aria-describedby={
                    errors.narrationPhone
                      ? "narrationPhone-error narrationPhone-hint"
                      : "narrationPhone-hint"
                  }
                  data-invalid={errors.narrationPhone ? "true" : undefined}
                  className="h-12 min-w-0 flex-1 border-[#8E877E] placeholder:text-[#6B655E]"
                />
              </div>
              <FieldError id="narrationPhone-error" message={errors.narrationPhone} />
              <p id="narrationPhone-hint" className="text-base leading-6 text-[#5F5A54]">
                Aus einem anderen Land? Geben Sie die Nummer mit + und Ländervorwahl ein.
              </p>
            </div>
          )}

          <p className="mt-6 text-base leading-7 text-[#4A453F]">
            Die Erzähl-Impulse kommen jeden Sonntag. Der Rhythmus lässt sich später in der
            Projektübersicht ändern.
          </p>

          {isGift && (
            <div className="mt-6">
              <label
                htmlFor="narrationConsent"
                className="flex min-h-11 cursor-pointer items-start gap-3 border border-[#BDB5AA] bg-[#FAF8F6] p-4 text-base leading-6 text-[#3E3831]"
              >
                <Checkbox
                  id="narrationConsent"
                  checked={state.narrationConsent}
                  onCheckedChange={(checked) => onChange("narrationConsent", checked === true)}
                  aria-invalid={!!errors.narrationConsent}
                  aria-describedby={errors.narrationConsent ? "narrationConsent-error" : undefined}
                  data-invalid={errors.narrationConsent ? "true" : undefined}
                  className="mt-0.5 h-6 w-6 border-[#5F5A54] data-[state=checked]:border-[#3E3831] data-[state=checked]:bg-[#3E3831] data-[state=checked]:text-white"
                />
                <span className="[overflow-wrap:anywhere]">
                  Ich bestätige, dass {name} damit einverstanden ist, regelmäßig Nachrichten von
                  NARRAVIT zu erhalten.
                </span>
              </label>
              <FieldError id="narrationConsent-error" message={errors.narrationConsent} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
