import type { Metadata, Viewport } from "next";
import { Lato, Merriweather, PT_Serif } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// #region agent log
fetch("http://127.0.0.1:7800/ingest/fd631e72-4665-4122-b32e-2df0088c7344", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "5dfb08" }, body: JSON.stringify({ sessionId: "5dfb08", runId: "initial", hypothesisId: "H1-font-layout", location: "src/app/layout.tsx:6", message: "Root layout module evaluated before font setup", data: { fontFamilies: ["Lato", "Merriweather", "PT_Serif"] }, timestamp: Date.now() }) }).catch(() => {});
// #endregion

const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
});

const merriweather = Merriweather({
  variable: "--font-merriweather",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const ptSerif = PT_Serif({
  variable: "--font-pt-serif",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "NARRAVIT — Dein Lebensbuch",
  description:
    "NARRAVIT verwandelt persönliche Lebensgeschichten in ein hochwertig gedrucktes Hardcover-Buch. Schreiben oder erzählen — wir machen daraus ein Buch.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${lato.variable} ${merriweather.variable} ${ptSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-[100dvh] flex-col overflow-x-hidden bg-background text-foreground">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
