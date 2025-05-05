import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Day 36 - Rhythm Game",
  description: "A simple rhythm game built with Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${inter.className} bg-gray-200 text-gray-800`}>
        <Header />
        <main className="container mx-auto p-4 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
