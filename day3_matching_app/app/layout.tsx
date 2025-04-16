import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import UserSwitcher from "@/components/UserSwitcher";
import { Suspense } from 'react';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Day 3: Matching App",
  description: "A simple matching application",
};

function UserSwitcherLoading() {
  return <div className="text-white">Loading users...</div>;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body className={"font-mplus w-full min-h-screen flex flex-col items-center justify-center p-0 m-0 bg-gradient-to-br from-pink-100 via-blue-100 to-orange-100"}>
        <header className="bg-pink-500 text-white p-4 shadow-md sticky top-0 z-10 w-full">
          <div className="flex flex-wrap justify-between items-center max-w-7xl mx-auto px-4">
            <Link href="/" className="text-xl font-bold hover:text-pink-200 transition-colors mr-4 mb-2 sm:mb-0">Matching App</Link>
            <nav className="flex flex-wrap items-center space-x-4">
              <Link href="/matches" className="hover:text-pink-200 transition-colors mb-2 sm:mb-0">Matches</Link>
              <Suspense fallback={<UserSwitcherLoading />}>
                <UserSwitcher />
              </Suspense>
            </nav>
          </div>
        </header>
        <main className="w-full min-h-screen flex flex-col items-center justify-center p-4">{children}</main>
        <footer className="bg-gradient-to-br from-pink-100 via-blue-100 to-orange-100 p-4 text-center text-sm text-pink-500">
          © 2024 Matching App
        </footer>
      </body>
    </html>
  );
}
