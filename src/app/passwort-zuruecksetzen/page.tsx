"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

export default function PasswortZuruecksetzenPage() {
  const [state, formAction, pending] = useActionState<ResetPasswordState, FormData>(
    resetPasswordAction,
    {},
  );

  return (
    <AuthLayout>
      <div className="mb-8 text-center md:mb-10">
        <h1 className="heading-style-h2 mb-4">Neues Passwort</h1>
        <p className="text-[#535252]">
          Wähle ein sicheres Passwort mit mindestens 8 Zeichen.
        </p>
      </div>

      <form action={formAction} className="grid gap-4" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Neues Passwort</Label>
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
            <p className="text-sm text-destructive">{state.fieldErrors.confirmPassword}</p>
          )}
        </div>

        {state.error && (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        )}

        <Button type="submit" className="h-12" disabled={pending}>
          {pending ? "Speichern …" : "Passwort setzen"}
        </Button>
      </form>
    </AuthLayout>
  );
}
