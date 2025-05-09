import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from 'next/link';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Day 41: Browser Security Playground",
  description: "Learn about browser security features interactively.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="dark">
      <body className={`${inter.className} bg-gray-900 text-gray-100 min-h-screen flex flex-col`}>
        <header className="p-4 bg-gray-800 shadow-md">
          <Link href="/">
            <h1 className="text-2xl font-bold text-center text-sky-400 hover:text-sky-300 transition-colors cursor-pointer">
              Day41 - Browser Security Playground
            </h1>
          </Link>
        </header>
        <main className="flex-grow container mx-auto p-4 md:p-8">
          {children}
        </main>
        <footer className="p-4 text-center text-sm text-gray-500 bg-gray-800">
          © 2025 Day 41 Challenge - Browser Security Learning
        </footer>
      </body>
    </html>
  );
}
