import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Day46 - ACME CA Sim",
  description: "ACME対応 簡易認証局シミュレーター",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${inter.className} bg-gray-900 text-gray-100 min-h-screen flex flex-col`}>
        <header className="p-4 bg-gray-800 shadow-md">
          <h1 className="text-2xl font-bold text-center text-cyan-400">Day46 - ACME対応 簡易認証局シミュレーター</h1>
        </header>
        <main className="flex-grow container mx-auto p-4">
          {children}
        </main>
        <footer className="p-4 bg-gray-800 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} 100 Day Challenge. All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
}
