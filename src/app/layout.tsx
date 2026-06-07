import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GAME_ICON_SRC } from "@/lib/skill-icons";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ironwood Guild Trials",
  description: "Coordinate weekly Guild Trials signups for Ironwood RPG",
  icons: {
    icon: [{ url: GAME_ICON_SRC, type: "image/png" }],
    apple: [{ url: GAME_ICON_SRC, type: "image/png" }],
    shortcut: GAME_ICON_SRC,
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
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">{children}</body>
    </html>
  );
}
