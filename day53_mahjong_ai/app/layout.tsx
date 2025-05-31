import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Day53 - CPU対戦二人麻雀",
  description: "最強AI搭載の二人麻雀ゲーム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${inter.className} bg-slate-100 text-slate-800`}>
        {children}
      </body>
    </html>
  );
}
