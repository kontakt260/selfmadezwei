"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import {
  loginAction,
  resendConfirmAction,
  type LoginState,
  type ResendState,
} from "./actions";

function ExpiredLinkBanner() {
  const params = useSearchParams();
  const showExpired = params.get("error") === "expired_link";
  const [resendState, resendForm, resendPending] = useActionState<ResendState, FormData>(
    resendConfirmAction,
    {},
  );

  if (!showExpired) return null;

  if (resendState.success) {
    return (
      <div className="mb-6 border border-[#e0dcd5] bg-[#FAF8F6] p-4 text-sm text-[#535252]">
        Falls ein Konto mit dieser E-Mail existiert, hast du eine neue
        Bestätigungs-E-Mail erhalten.
      </div>
    );
  }

  return (
    <form action={resendForm} className="mb-6 grid gap-3 border border-[#e0dcd5] bg-[#FAF8F6] p-4 text-sm">
      <p className="font-medium">Dieser Link ist nicht mehr gültig.</p>
      <p className="text-[#535252]">
        Trage deine E-Mail ein, und wir schicken dir eine neue Bestätigungs-E-Mail.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="resend-email" className="text-xs">E-Mail</Label>
        <Input
          id="resend-email"
          name="email"
          type="email"
          required
          className="h-12"
        />
      </div>
      {resendState.error && (
        <p className="text-destructive">{resendState.error}</p>
      )}
      <Button type="submit" variant="outline" disabled={resendPending} className="h-12">
        {resendPending ? "Wird gesendet …" : "Neue Bestätigungs-E-Mail anfordern"}
      </Button>
    </form>
  );
}

function AnmeldenContent() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/";
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <AuthLayout>
      <div className="mb-8 text-center md:mb-10">
        <h1 className="heading-style-h2 mb-4">Anmelden</h1>
        <p className="text-[#535252]">
          Willkommen zurück bei NARRAVIT.
        </p>
      </div>

      <Suspense fallback={null}>
        <ExpiredLinkBanner />
      </Suspense>

      <form action={formAction} className="grid gap-4" noValidate>
        <input type="hidden" name="next" value={nextPath} />

        <div className="grid gap-1.5">
          <Label htmlFor="email">E-Mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
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
            autoComplete="current-password"
            required
            aria-invalid={Boolean(state.fieldErrors?.password)}
            className="h-12"
          />
          {state.fieldErrors?.password && (
            <p className="text-sm text-destructive">{state.fieldErrors.password}</p>
          )}
        </div>

        {state.error && (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        )}

        <Button type="submit" className="h-12" disabled={pending}>
          {pending ? "Anmeldung …" : "Anmelden"}
        </Button>

        <div className="my-3 flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#848484]">oder</span>
          <Separator className="flex-1" />
        </div>

        <OAuthButtons mode="anmelden" redirectPath={nextPath} />
      </form>

      <div className="mt-6 text-center">
        <Link href="/passwort-vergessen" className="text-sm underline underline-offset-4">
          Passwort vergessen?
        </Link>
      </div>

      <div className="mt-3 flex justify-center gap-x-1 text-center text-sm">
        <p className="text-[#848484]">Noch kein Konto?</p>
        <Link href="/registrieren" className="underline underline-offset-4">
          Jetzt registrieren
        </Link>
      </div>
    </AuthLayout>
  );
}

export default function AnmeldenPage() {
  return (
    <Suspense fallback={null}>
      <AnmeldenContent />
    </Suspense>
  );
}
