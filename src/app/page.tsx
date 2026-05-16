import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/SignOutButton";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-[5%] py-4">
        <p className="font-medium tracking-tight">NARRAVIT</p>
        {user && <SignOutButton />}
      </header>

      <div className="flex flex-1 items-center justify-center px-[5%] py-20">
        <div className="max-w-xl text-center">
          <h1 className="heading-style-h2 mb-4">Willkommen bei NARRAVIT</h1>
          <p className="text-muted-foreground">
            Dein persönlicher Bereich wird in PROJ-3 gebaut. Aktuell siehst du hier nur die
            authentifizierte Startseite.
          </p>
          {user && (
            <p className="mt-6 text-sm text-muted-foreground">
              Eingeloggt als <span className="font-medium">{user.email}</span>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
