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

export default function RegistrierenPage() {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(
    registerAction,
    {},
  );

  return (
    <AuthLayout>
      <div className="mb-8 text-center md:mb-10">
        <h1 className="heading-style-h2 mb-4">Konto erstellen</h1>
        <p className="text-[#535252]">
          Starte dein Lebensbuch in wenigen Minuten.
        </p>
      </div>

      <form action={formAction} className="grid gap-4" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="fullName">Vollständiger Name</Label>
          <Input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            aria-invalid={Boolean(state.fieldErrors?.fullName)}
            className="h-11"
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
            autoComplete="new-password"
            required
            minLength={8}
            aria-invalid={Boolean(state.fieldErrors?.password)}
            className="h-11"
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
            className="h-11"
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

        <Button type="submit" className="h-11" disabled={pending}>
          {pending ? "Konto wird erstellt …" : "Konto erstellen"}
        </Button>

        <div className="my-3 flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#848484]">oder</span>
          <Separator className="flex-1" />
        </div>

        <OAuthButtons mode="registrieren" />
      </form>

      <div className="mt-6 flex justify-center gap-x-1 text-center text-sm">
        <p className="text-[#848484]">Bereits ein Konto?</p>
        <Link href="/anmelden" className="underline underline-offset-4">
          Anmelden
        </Link>
      </div>
    </AuthLayout>
  );
}
