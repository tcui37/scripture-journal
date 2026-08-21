import type { Metadata } from "next";
import { Caprasimo, Figtree, Source_Serif_4 } from "next/font/google";

import "./globals.css";

const heading = Caprasimo({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const body = Figtree({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const serif = Source_Serif_4({
  weight: ["400", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Scripture Journal",
  description: "A passage, a wide margin, room to write.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
