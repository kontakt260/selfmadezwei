"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type OAuthButtonsProps = {
  mode: "anmelden" | "registrieren";
  redirectPath?: string;
};

type OAuthProvider = "google" | "facebook" | "apple";

const labels = {
  anmelden: {
    google: "Mit Google anmelden",
    facebook: "Mit Facebook anmelden",
    apple: "Mit Apple anmelden",
  },
  registrieren: {
    google: "Mit Google registrieren",
    facebook: "Mit Facebook registrieren",
    apple: "Mit Apple registrieren",
  },
} as const;

const icons: Record<OAuthProvider, typeof GoogleIcon> = {
  google: GoogleIcon,
  facebook: FacebookIcon,
  apple: AppleIcon,
};

const activeProviders: OAuthProvider[] = ["google", "apple"];

export function OAuthButtons({ mode, redirectPath = "/" }: OAuthButtonsProps) {
  const [loading, setLoading] = useState<OAuthProvider | null>(null);

  const handleOAuth = async (provider: OAuthProvider) => {
    setLoading(provider);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
      },
    });

    if (error) {
      toast.error("Anmeldung fehlgeschlagen. Bitte versuche es erneut.");
      setLoading(null);
    }
  };

  return (
    <div className="grid gap-3">
      {activeProviders.map((provider) => {
        const Icon = icons[provider];

        return (
          <Button
            key={provider}
            type="button"
            variant="outline"
            className="h-12 gap-3"
            onClick={() => handleOAuth(provider)}
            disabled={loading !== null}
          >
            <Icon />
            {loading === provider ? "Weiterleitung …" : labels[mode][provider]}
          </Button>
        );
      })}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.283 10.356h-8.327v3.451h4.792c-.446 2.193-2.313 3.453-4.792 3.453a5.27 5.27 0 0 1-5.279-5.28 5.27 5.27 0 0 1 5.279-5.279c1.259 0 2.397.447 3.29 1.178l2.6-2.599c-1.584-1.381-3.615-2.233-5.89-2.233a8.908 8.908 0 0 0-8.934 8.934 8.907 8.907 0 0 0 8.934 8.934c4.467 0 8.529-3.249 8.529-8.934 0-.528-.081-1.097-.202-1.625z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M22 12.061C22 6.505 17.523 2 12 2S2 6.505 2 12.061c0 5.023 3.657 9.184 8.438 9.939v-7.03H7.898v-2.909h2.54V9.844c0-2.522 1.492-3.915 3.777-3.915 1.094 0 2.238.196 2.238.196v2.475h-1.26c-1.242 0-1.63.775-1.63 1.57v1.891h2.773l-.443 2.909h-2.33V22C18.343 21.245 22 17.084 22 12.061z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.665 16.811a10.316 10.316 0 0 1-1.021 1.837c-.537.767-.978 1.297-1.316 1.592-.525.482-1.089.73-1.692.744-.432 0-.954-.123-1.562-.373-.61-.249-1.17-.371-1.683-.371-.537 0-1.113.122-1.73.371-.616.25-1.114.381-1.495.393-.577.025-1.154-.229-1.729-.764-.367-.32-.826-.87-1.377-1.648-.59-.829-1.075-1.794-1.455-2.891-.407-1.187-.611-2.335-.611-3.447 0-1.273.275-2.372.826-3.292a4.857 4.857 0 0 1 1.73-1.751 4.65 4.65 0 0 1 2.34-.662c.46 0 1.063.142 1.81.422s1.227.422 1.436.422c.158 0 .689-.167 1.593-.498.853-.307 1.573-.434 2.163-.384 1.6.129 2.801.759 3.6 1.895-1.43.867-2.137 2.08-2.123 3.637.012 1.213.453 2.222 1.317 3.023a4.33 4.33 0 0 0 1.315.863c-.106.307-.218.6-.336.882zM15.998 2.38c0 .95-.348 1.838-1.039 2.659-.836.976-1.846 1.541-2.941 1.452a2.955 2.955 0 0 1-.021-.36c0-.913.396-1.889 1.103-2.688.352-.404.8-.741 1.343-1.009.542-.264 1.054-.41 1.536-.435.013.128.019.255.019.381z"
      />
    </svg>
  );
}
