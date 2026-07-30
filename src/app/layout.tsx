import type { Metadata } from "next";
import { Inter, Rajdhani, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display-loaded",
  weight: ["600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body-loaded",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  variable: "--font-num-loaded",
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "tips3x3 · Exchange Futebol com IA",
  description:
    "Análises em tempo real, filtros inteligentes e estratégias profissionais para quem opera o mercado de Exchange Futebol.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tips3x3",
  },
  icons: {
    icon: "/logo-tips3x3.png",
    apple: "/logo-tips3x3.png",
  },
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
      className={`${sora.variable} ${inter.variable} ${rajdhani.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
