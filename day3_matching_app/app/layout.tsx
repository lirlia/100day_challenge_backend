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
  return <div className="text-white">ユーザー読込中...</div>;
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
        <header className="bg-white/80 backdrop-blur-sm text-pink-600 p-4 border-b border-pink-200 shadow-sm sticky top-0 z-10 w-full">
          <div className="flex flex-wrap justify-between items-center max-w-7xl mx-auto px-4">
            <Link href="/" className="text-xl font-bold hover:text-pink-400 transition-colors mr-4 mb-2 sm:mb-0">Day3 マッチングアプリ</Link>
            <nav className="flex flex-wrap items-center space-x-4">
              <Link href="/matches" className="hover:text-pink-400 transition-colors mb-2 sm:mb-0">マッチ</Link>
              <Suspense fallback={<UserSwitcherLoading />}>
                <UserSwitcher />
              </Suspense>
            </nav>
          </div>
        </header>
        <main className="w-full flex-grow flex flex-col items-center justify-start p-4 pt-8 sm:pt-12">{children}</main>
      </body>
    </html>
  );
}
