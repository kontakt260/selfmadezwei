"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function normalizePathForMatch(path: string) {
  try {
    return decodeURIComponent(path).normalize("NFC");
  } catch {
    return path.normalize("NFC");
  }
}

function pathMatchesRoute(pathname: string, route: string) {
  const p = normalizePathForMatch(pathname);
  const r = normalizePathForMatch(route);

  if (r === "/" || r === "") {
    return p === "/" || p === "";
  }

  if (p === r) return true;

  const base = r.endsWith("/") ? r.slice(0, -1) : r;
  return p.startsWith(`${base}/`);
}

function NavIcon({
  src,
  active,
  className,
}: {
  src: string;
  active: boolean;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt=""
      width={49}
      height={49}
      className={`h-[2.7225rem] w-[2.7225rem] shrink-0 object-contain xl:h-[2.1175rem] xl:w-[2.1175rem] ${
        active ? "nav-sidebar-icon-active" : "nav-sidebar-icon-inactive"
      } ${className ?? ""}`}
      aria-hidden
      unoptimized
    />
  );
}

const PERSONAL_ROUTE = "/persoenlicher-bereich";
const PROJEKT_ROUTE = "/projektuebersicht";

const iconNav = [
  {
    href: "/",
    label: "Startseite",
    iconSrc: "/nav/home.png",
    isActive: (p: string) =>
      pathMatchesRoute(p, "/") || pathMatchesRoute(p, PROJEKT_ROUTE),
  },
  {
    href: PERSONAL_ROUTE,
    label: "Persönlicher Bereich",
    iconSrc: "/nav/account.png",
    isActive: (p: string) => pathMatchesRoute(p, PERSONAL_ROUTE),
  },
] as const;

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      width={32}
      height={32}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      className="text-[#3E3831]"
      aria-hidden
    >
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}

function SidebarPanel({
  pathname,
  onNavigate,
  showLogo = true,
  onLogoutClick,
}: {
  pathname: string;
  onNavigate?: () => void;
  showLogo?: boolean;
  onLogoutClick?: () => void;
}) {
  const afterNav = () => {
    onNavigate?.();
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col items-center bg-[#f2f2f2] px-[0.825rem] py-4 xl:px-[0.55rem]">
      {showLogo ? (
        <Link
          href="/"
          onClick={afterNav}
          className="mb-[1.65rem] flex w-full max-w-full shrink-0 items-center justify-center border-b border-border pb-[1.1rem]"
        >
          <Image
            src="/logo.svg"
            alt="Logo"
            width={220}
            height={66}
            className="h-[3.3rem] w-auto max-w-full object-contain object-center xl:h-[3.85rem]"
            priority
            unoptimized
          />
        </Link>
      ) : null}

      <nav
        className={`flex shrink-0 flex-col items-center gap-[1.1rem] xl:gap-[0.825rem] ${showLogo ? "" : "pt-[1.1rem] xl:pt-[0.825rem]"}`}
        aria-label="Hauptnavigation"
      >
        {iconNav.map(({ href, label, iconSrc, isActive }) => {
          const active = isActive(pathname);
          const ariaCurrentPage =
            (href === "/" && pathMatchesRoute(pathname, "/")) ||
            (href !== "/" && active)
              ? "page"
              : undefined;

          return (
            <Link
              key={href}
              href={href}
              onClick={afterNav}
              aria-label={label}
              aria-current={ariaCurrentPage}
              title={label}
              className={`flex h-[4.235rem] w-[4.235rem] shrink-0 items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3E3831] xl:h-[3.63rem] xl:w-[3.63rem] ${
                active ? "bg-[#96b596]" : "bg-transparent hover:bg-black/[0.04]"
              }`}
            >
              <NavIcon src={iconSrc} active={active} />
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex shrink-0 flex-col items-center pb-1">
        <button
          type="button"
          aria-label="Abmelden"
          title="Abmelden"
          onClick={() => onLogoutClick?.()}
          className="flex h-[4.235rem] w-[4.235rem] shrink-0 cursor-pointer items-center justify-center bg-transparent hover:bg-black/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3E3831] xl:h-[3.63rem] xl:w-[3.63rem]"
        >
          <NavIcon src="/nav/logout.png" active={false} className="rotate-180" />
        </button>
      </div>
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const logoutTitleId = useId();
  const logoutDescId = useId();

  const closeLogoutDialog = useCallback(() => {
    if (!logoutPending) setLogoutOpen(false);
  }, [logoutPending]);

  const confirmLogout = useCallback(async () => {
    setLogoutPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    setLogoutOpen(false);
    setOpen(false);
    router.push("/anmelden");
    router.refresh();
  }, [router]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open && !logoutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        closeLogoutDialog();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, logoutOpen, closeLogoutDialog]);

  useEffect(() => {
    if (!open && !logoutOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, logoutOpen]);

  return (
    <>
      {logoutOpen ? (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center p-5 sm:p-8"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-pointer bg-black/45 transition-opacity"
            aria-label="Dialog schließen"
            onClick={closeLogoutDialog}
            disabled={logoutPending}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={logoutTitleId}
            aria-describedby={logoutDescId}
            className="relative z-10 w-full max-w-[calc(100vw-2rem)] border border-[#e0dcd5] bg-[#FAF8F6] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.18)] sm:max-w-2xl sm:p-10"
          >
            <h2
              id={logoutTitleId}
              className="[font-family:var(--font-pt-serif)] text-3xl leading-10 text-[#3E3831] sm:text-4xl sm:leading-[1.2]"
            >
              Abmelden?
            </h2>
            <div
              id={logoutDescId}
              className="mt-5 space-y-3 text-lg leading-8 text-[#535252] sm:text-xl sm:leading-9"
            >
              <p>
                Möchten Sie sich wirklich abmelden? Sie werden zur Anmeldeseite
                weitergeleitet.
              </p>
              <p>
                Um NARRAVIT danach wieder zu nutzen, melden Sie sich bitte erneut
                an.
              </p>
            </div>
            <div className="mt-8 flex flex-col-reverse gap-4 sm:flex-row sm:justify-end sm:gap-5">
              <button
                type="button"
                onClick={closeLogoutDialog}
                disabled={logoutPending}
                className="min-h-12 w-full border border-[#e0dcd5] bg-white px-6 py-3.5 text-center text-lg font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:text-xl"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                disabled={logoutPending}
                className="min-h-12 w-full bg-[#53444B] px-6 py-3.5 text-center text-lg font-bold text-white transition-colors hover:bg-[#45383e] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:text-xl"
              >
                {logoutPending ? "Wird abgemeldet ..." : "Abmelden"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-44 flex-col border-r border-border bg-[#f2f2f2] xl:flex">
        <SidebarPanel
          pathname={pathname}
          onLogoutClick={() => setLogoutOpen(true)}
        />
      </aside>

      <header className="fixed left-0 right-0 top-0 z-[60] flex items-center justify-between border-b border-border bg-[#f2f2f2] px-5 py-[0.921rem] xl:hidden">
        <Link
          href="/"
          className="flex min-w-0 max-w-[calc(100%-5rem)] items-center py-[0.553rem]"
          onClick={() => setOpen(false)}
        >
          <Image
            src="/logo.svg"
            alt="Logo"
            width={264}
            height={79}
            className="h-[4.4rem] w-auto max-w-full object-contain object-left"
            priority
            unoptimized
          />
        </Link>
        <button
          type="button"
          className="flex h-[4.235rem] w-[4.235rem] shrink-0 items-center justify-center text-[#3E3831] transition-colors hover:bg-black/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3E3831]"
          aria-label={open ? "Menü schließen" : "Menü öffnen"}
          aria-expanded={open}
          aria-controls="mobile-sidebar"
          onClick={() => setOpen((o) => !o)}
        >
          <MenuIcon open={open} />
        </button>
      </header>

      <button
        type="button"
        tabIndex={open ? 0 : -1}
        className={`fixed bottom-0 left-0 right-0 top-[7.348rem] z-40 cursor-pointer bg-black/40 transition-opacity duration-200 xl:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-label="Menü schließen"
        onClick={() => setOpen(false)}
      />

      <div
        id="mobile-sidebar"
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        className={`fixed bottom-0 left-0 top-[7.348rem] z-[50] w-[9.5rem] max-w-[min(100vw,10rem)] border-r border-border bg-[#f2f2f2] shadow-[4px_0_24px_rgba(0,0,0,0.08)] transition-transform duration-200 ease-out sm:w-[12.342rem] sm:max-w-[min(100vw,12.856rem)] xl:hidden ${
          open ? "translate-x-0" : "pointer-events-none -translate-x-full"
        }`}
      >
        <SidebarPanel
          pathname={pathname}
          onNavigate={() => setOpen(false)}
          showLogo={false}
          onLogoutClick={() => setLogoutOpen(true)}
        />
      </div>
    </>
  );
}
