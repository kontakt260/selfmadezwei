import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/auth/SignOutButton";

export default function ZugangAbgelaufenPage() {
  return (
    <AuthLayout>
      <div className="text-center">
        <h1 className="heading-style-h2 mb-4">Ihr Zugang ist abgelaufen</h1>
        <p className="mb-8 text-[#535252]">
          Ihr NARRAVIT-Portalzugang ist nicht mehr aktiv. Verlängern Sie ihn, um wieder
          in Ihrem Projekt zu schreiben.
        </p>

        {/* TODO PROJ-6: Button auf Stripe-Checkout-Session umstellen. */}
        <Button disabled className="mb-6 h-12 w-full">
          Zugang verlängern — 79 €
        </Button>

        <SignOutButton />
      </div>
    </AuthLayout>
  );
}
