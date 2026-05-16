import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/SignOutButton";
import Image from "next/image";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col bg-[#FAF8F6] text-[#3E3831]">
      <header className="flex items-center justify-between border-b border-[#e0dcd5] px-[5%] py-4">
        <div className="flex items-center gap-4">
          <Image src="/logo.svg" alt="" width={76} height={68} className="h-14 w-auto" priority />
          <span className="[font-family:var(--font-merriweather)] text-3xl font-normal leading-none tracking-[0.02em] text-[#2f3b30]">
            NARRAVIT
          </span>
        </div>
        {user && <SignOutButton />}
      </header>

      <div className="flex flex-1 items-center justify-center px-[5%] py-20">
        <div className="w-full max-w-2xl border border-[#e0dcd5] bg-white p-6 text-center sm:p-10 md:p-12">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-[#96B897]">
            Schreibportal
          </p>
          <h1 className="heading-style-h2 mb-5">Willkommen bei NARRAVIT</h1>
          <p className="mx-auto max-w-xl text-[#535252]">
            Dein persönlicher Bereich wird in PROJ-3 gebaut. Aktuell siehst du hier nur die
            authentifizierte Startseite.
          </p>
          {user && (
            <p className="mt-8 border border-[#e0dcd5] bg-[#FAF8F6] p-4 text-sm text-[#535252]">
              Eingeloggt als <span className="font-medium">{user.email}</span>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
