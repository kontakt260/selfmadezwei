import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/auth/SignOutButton";

export default function ZugangAbgelaufenPage() {
  return (
    <AuthLayout>
      <div className="text-center">
        <h1 className="heading-style-h2 mb-4">Dein Zugang ist abgelaufen</h1>
        <p className="mb-8 text-muted-foreground">
          Dein NARRAVIT-Portalzugang ist nicht mehr aktiv. Verlängere ihn, um wieder
          in deinem Projekt zu schreiben.
        </p>

        {/* TODO PROJ-6: Button auf Stripe-Checkout-Session umstellen. */}
        <Button disabled className="mb-6 h-11 w-full">
          Zugang verlängern — 79 €
        </Button>

        <SignOutButton />
      </div>
    </AuthLayout>
  );
}
