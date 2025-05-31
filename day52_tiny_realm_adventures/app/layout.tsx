import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { VT323 } from "next/font/google";
import "./globals.css";
import React from 'react';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const vt323 = VT323({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-vt323",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Day52 - タイニーレルム冒険譚",
  description: "A tiny realm for tiny adventures!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${vt323.variable}`}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-800 text-white`}
      >
        {children}
      </body>
    </html>
  );
}
