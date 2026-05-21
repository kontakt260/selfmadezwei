"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { registerAction, type RegisterState } from "./actions";

// PROJ-9 Hotfix B-3:
// Vorher: page.tsx war eine reine Client-Komponente mit useSearchParams,
// gewrappt in <Suspense fallback={null}>. Auf statisch-gerendertem
// Vercel-Edge-Cache fehlten dadurch die initialen URL-Param-abhängigen
// Hidden-Felder im SSR-HTML → wenn der User vor JS-Hydration submittete,
// kam der „next"-Wert nicht in der FormData an → Action fiel auf
// „/onboarding" zurück und der Accept-Pfad brach.
//
// Fix: Page ist jetzt Server-Component, liest searchParams aus den
// Next.js-Page-Props und reicht die initialen Werte als Props ein.
// Hidden-Inputs sind ab dem ersten Render mit dem korrekten Wert da.

type Props = {
  initialEmail: string;
  initialNext: string;
  initialOnboardingIntent: string;
};

export function RegistrierenClient({
  initialEmail,
  initialNext,
  initialOnboardingIntent,
}: Props) {
  const onboardingPath = initialOnboardingIntent
    ? `/onboarding?for=${encodeURIComponent(initialOnboardingIntent)}`
    : "/onboarding";
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(
    registerAction,
    {},
  );

  return (
    <AuthLayout>
      <div className="mb-8 text-center md:mb-10">
        <h1 className="[font-family:var(--font-merriweather)] mb-4 text-[2.75rem] font-normal leading-[1.15] tracking-[-0.03rem] text-[#3E3831] sm:text-5xl sm:leading-[1.18] xl:whitespace-nowrap">
          Konto erstellen
        </h1>
        <p className="text-[#535252]">
          Starte dein Lebensbuch in wenigen Minuten.
        </p>
      </div>

      <form action={formAction} className="grid gap-4" noValidate>
        <input type="hidden" name="onboardingIntent" value={initialOnboardingIntent} />
        <input type="hidden" name="next" value={initialNext} />

        <div className="grid gap-1.5">
          <Label htmlFor="fullName">Vollständiger Name</Label>
          <Input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            aria-invalid={Boolean(state.fieldErrors?.fullName)}
            className="h-12"
          />
          {state.fieldErrors?.fullName && (
            <p className="text-sm text-destructive">{state.fieldErrors.fullName}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="email">E-Mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={initialEmail}
            aria-invalid={Boolean(state.fieldErrors?.email)}
            className="h-12"
          />
          {state.fieldErrors?.email && (
            <p className="text-sm text-destructive">{state.fieldErrors.email}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="password">Passwort</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            aria-invalid={Boolean(state.fieldErrors?.password)}
            className="h-12"
          />
          {state.fieldErrors?.password && (
            <p className="text-sm text-destructive">{state.fieldErrors.password}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="confirmPassword">Passwort wiederholen</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
            className="h-12"
          />
          {state.fieldErrors?.confirmPassword && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.confirmPassword}
            </p>
          )}
        </div>

        {state.error && (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        )}

        <Button type="submit" className="h-12 sm:whitespace-nowrap" disabled={pending}>
          {pending ? "Konto wird erstellt …" : "Konto erstellen"}
        </Button>

        <div className="my-3 flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#848484]">oder</span>
          <Separator className="flex-1" />
        </div>

        <OAuthButtons mode="registrieren" redirectPath={onboardingPath} />
      </form>

      <div className="mt-6 flex justify-center gap-x-1 text-center text-sm">
        <p className="text-[#848484]">Bereits ein Konto?</p>
        <Link href="/anmelden" className="underline underline-offset-4 transition-colors hover:text-[#96B897]">
          Anmelden
        </Link>
      </div>
    </AuthLayout>
  );
}
