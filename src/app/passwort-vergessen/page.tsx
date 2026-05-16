"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { forgotPasswordAction, type ForgotPasswordState } from "./actions";

export default function PasswortVergessenPage() {
  const [state, formAction, pending] = useActionState<ForgotPasswordState, FormData>(
    forgotPasswordAction,
    {},
  );

  if (state.success) {
    return (
      <AuthLayout>
        <div className="text-center">
          <h1 className="heading-style-h2 mb-4">E-Mail unterwegs</h1>
          <p className="mb-8 text-muted-foreground">
            Falls ein Konto mit dieser E-Mail existiert, hast du einen Reset-Link erhalten.
          </p>
          <Link href="/anmelden" className="underline underline-offset-4">
            Zurück zur Anmeldung
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="mb-8 text-center md:mb-10">
        <h1 className="heading-style-h2 mb-4">Passwort vergessen?</h1>
        <p className="text-muted-foreground">
          Wir schicken dir einen Link, um ein neues Passwort zu setzen.
        </p>
      </div>

      <p className="mb-6 border border-border bg-secondary p-4 text-sm text-muted-foreground">
        Hast du dich mit Google oder Apple registriert? Dann setzt du dein Passwort
        bei deinem Provider zurück — NARRAVIT kann nur Passwörter für E-Mail-Konten ändern.
      </p>

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

        <Button type="submit" className="h-11" disabled={pending}>
          {pending ? "Wird gesendet …" : "Reset-Link senden"}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm">
        <Link href="/anmelden" className="underline underline-offset-4">
          Zurück zur Anmeldung
        </Link>
      </div>
    </AuthLayout>
  );
}
