import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Day 3: Matching App",
  description: "A simple matching application",
};

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
        <Header />
        <main className="w-full flex-grow flex flex-col items-center justify-start p-4 pt-8 sm:pt-12">{children}</main>
      </body>
    </html>
  );
}
