import type { ReactNode } from "react";
import { LoadingBlock, LoadingHint, LoadingPage } from "./LoadingParts";

// PROJ-30: Ladeansichten in der Form der Zielseite. Sie enthalten keine
// Projektdaten und erscheinen nur, wenn eine Seite länger braucht.

const HOME_MAIN_CLASS =
  "[font-family:var(--font-lato)] box-border min-h-full w-full min-w-0 flex-1 bg-[#FAF8F6] pt-[7.348rem] xl:pl-[11rem] xl:pt-0";

function StartLoadingView() {
  return (
    <LoadingPage mainClassName={HOME_MAIN_CLASS}>
      <div className="flex min-h-[320px] w-full items-start justify-center bg-[#EFEAE3] px-4 pt-16 md:min-h-[360px] md:pt-24">
        <LoadingHint />
      </div>
      <div className="relative mx-auto -mt-[4.25rem] flex w-full max-w-[1144px] flex-col gap-6 px-4 pb-16 sm:gap-7 sm:px-6 md:px-8">
        <div className="flex flex-col gap-6 border border-[#E0DCD5] bg-white p-6 sm:flex-row sm:p-8">
          <LoadingBlock className="aspect-[148/210] w-40 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <LoadingBlock className="h-10 w-3/4" />
            <LoadingBlock className="h-6 w-1/2" />
          </div>
        </div>
        <LoadingBlock className="h-32 w-full" />
      </div>
    </LoadingPage>
  );
}

function ProjectLoadingView() {
  return (
    <LoadingPage>
      <div className="mx-auto flex w-full max-w-[1213px] flex-col gap-6 sm:gap-8">
        <LoadingHint />
        <section className="flex flex-col border border-[#E0DCD5] bg-white lg:flex-row">
          <div className="flex items-center justify-center bg-[#EFEAE3] px-6 py-10 sm:px-10 sm:py-14 lg:flex-1">
            <div className="aspect-[148/210] w-full max-w-[280px] bg-[#E0DCD5]" aria-hidden />
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-6 p-6 sm:p-10 lg:flex-1 lg:p-14">
            <LoadingBlock className="h-12 w-4/5" />
            <LoadingBlock className="h-7 w-3/5" />
          </div>
        </section>
        <section className="flex flex-col gap-4 border border-[#E0DCD5] bg-white p-6 sm:p-8">
          <LoadingBlock className="h-9 w-48 max-w-full" />
          <LoadingBlock className="h-20 w-full" />
          <LoadingBlock className="h-20 w-full" />
          <LoadingBlock className="h-20 w-full" />
        </section>
      </div>
    </LoadingPage>
  );
}

function CoverLoadingView() {
  return (
    <LoadingPage>
      <div className="mx-auto flex w-full max-w-[1213px] flex-col gap-8 sm:gap-10 md:gap-12">
        <header className="flex flex-col gap-3">
          <LoadingBlock className="h-7 w-64 max-w-full" />
          <LoadingBlock className="h-11 w-72 max-w-full" />
          <LoadingHint />
        </header>
        <section className="flex flex-col gap-6 bg-white p-5 sm:p-8 lg:flex-row">
          <LoadingBlock className="aspect-[148/210] w-full max-w-[320px] shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <LoadingBlock className="h-12 w-full" />
            <LoadingBlock className="h-12 w-full" />
            <LoadingBlock className="h-12 w-full" />
            <LoadingBlock className="h-24 w-full" />
          </div>
        </section>
      </div>
    </LoadingPage>
  );
}

function AccountLoadingView() {
  return (
    <LoadingPage>
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
        <header className="flex flex-col gap-3 pb-3">
          <LoadingBlock className="h-12 w-72 max-w-full" />
          <LoadingHint />
        </header>
        <LoadingBlock className="h-56 w-full" />
        <LoadingBlock className="h-40 w-full" />
        <LoadingBlock className="h-32 w-full" />
      </div>
    </LoadingPage>
  );
}

// Der Editor hat keine Navigation. Die Ansicht zeigt seinen Tisch mit einer
// A5-Seite, auf dem Phone nur den Hinweis.
function EditorLoadingView() {
  return (
    <main className="a5-desk [font-family:var(--font-lato)] flex min-h-[100dvh] flex-col">
      <div className="hidden h-14 border-b border-[#e0dcd5] bg-[#ece6df] md:block" aria-hidden />
      <div className="hidden h-[3.25rem] border-b border-[#e0dcd5] bg-[#ece6df] md:block" aria-hidden />
      <div className="flex flex-1 flex-col items-center gap-6 px-4 py-8 sm:px-6 md:px-10">
        <LoadingHint />
        <div className="hidden aspect-[148/210] w-[148mm] max-w-full flex-col gap-4 bg-white p-[2cm] md:flex">
          <LoadingBlock className="h-9 w-3/5 self-center" />
          <LoadingBlock className="mt-6 h-4 w-full" />
          <LoadingBlock className="h-4 w-full" />
          <LoadingBlock className="h-4 w-11/12" />
          <LoadingBlock className="h-4 w-full" />
          <LoadingBlock className="h-4 w-4/5" />
        </div>
      </div>
    </main>
  );
}

export type LoadingViewKind = "start" | "project" | "cover" | "editor" | "account";

/** Welche Ladeansicht zu einer Adresse gehört. `null` für alle anderen Seiten. */
export function loadingViewKind(pathname: string): LoadingViewKind | null {
  if (pathname === "/") return "start";
  if (pathname === "/persoenlicher-bereich") return "account";
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "projektuebersicht" || !parts[1]) return null;
  if (parts.length === 2) return "project";
  if (parts.length === 3 && parts[2] === "cover-bearbeiten") return "cover";
  if (parts.length === 4 && parts[2] === "kapiteleditor") return "editor";
  return null;
}

const VIEWS: Record<LoadingViewKind, () => ReactNode> = {
  start: StartLoadingView,
  project: ProjectLoadingView,
  cover: CoverLoadingView,
  editor: EditorLoadingView,
  account: AccountLoadingView,
};

export function LoadingView({ kind }: { kind: LoadingViewKind }) {
  const View = VIEWS[kind];
  return <View />;
}
