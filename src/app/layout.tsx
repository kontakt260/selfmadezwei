import type { Metadata, Viewport } from "next";
import { Lato, Merriweather, PT_Serif } from "next/font/google";
import { AuthHero } from "@/components/auth/AuthHero";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

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
      <body className="flex min-h-[100dvh] flex-col bg-background text-foreground">
        <AuthHero />
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
