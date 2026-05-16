"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { loginAction, type LoginState } from "./actions";

export default function AnmeldenPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <AuthLayout>
      <div className="mb-8 text-center md:mb-10">
        <h1 className="heading-style-h2 mb-4">Anmelden</h1>
        <p className="text-muted-foreground">
          Willkommen zurück bei NARRAVIT.
        </p>
      </div>

      <form action={formAction} className="grid gap-4" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="email">E-Mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(state.fieldErrors?.email)}
            className="h-11"
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
            className="h-11"
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

        <Button type="submit" className="h-11" disabled={pending}>
          {pending ? "Anmeldung …" : "Anmelden"}
        </Button>

        <div className="my-2 flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">oder</span>
          <Separator className="flex-1" />
        </div>

        <OAuthButtons mode="anmelden" />
      </form>

      <div className="mt-6 text-center">
        <Link href="/passwort-vergessen" className="text-sm underline underline-offset-4">
          Passwort vergessen?
        </Link>
      </div>

      <div className="mt-3 flex justify-center gap-x-1 text-center text-sm">
        <p className="text-muted-foreground">Noch kein Konto?</p>
        <Link href="/registrieren" className="underline underline-offset-4">
          Jetzt registrieren
        </Link>
      </div>
    </AuthLayout>
  );
}
