import Link from "next/link";
import { Mail } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function EmailBestaetigenPage() {
  return (
    <AuthLayout>
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center border border-[#e0dcd5] bg-[#FAF8F6] text-[#96B897]">
          <Mail className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="heading-style-h2 mb-4">Prüfen Sie Ihre E-Mail</h1>
        <p className="mb-8 text-[#535252]">
          Wir haben Ihnen einen Bestätigungslink geschickt. Klicken Sie auf den Link, um Ihr
          Konto zu aktivieren und mit dem Onboarding zu starten.
        </p>
        <p className="text-sm text-[#848484]">
          Keine E-Mail erhalten? Prüfen Sie Ihren Spam-Ordner oder{" "}
          <Link href="/registrieren" className="underline underline-offset-4 transition-colors hover:text-[#96B897]">
            registrieren Sie sich erneut
          </Link>
          .
        </p>
      </div>
    </AuthLayout>
  );
}
