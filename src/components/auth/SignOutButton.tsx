"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/anmelden");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={pending}
      className="text-sm underline underline-offset-4 disabled:opacity-50"
    >
      {pending ? "Abmelden …" : "Abmelden"}
    </button>
  );
}
