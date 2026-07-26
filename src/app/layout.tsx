import type { Metadata } from "next";
import { Archivo_Black, Manrope } from "next/font/google";
import "./globals.css";

const archivoBlack = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display-loaded",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body-loaded",
});

export const metadata: Metadata = {
  title: "tips3x3 · Lay placar 3-3",
  description:
    "Painel de dados, análise pré-live e alertas de entrada para lay no placar exato 3-3 no Mexchange BetBra.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${archivoBlack.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
