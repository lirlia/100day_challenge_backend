import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Day 34 - B-Tree Visualizer", // タイトル変更
  description: "Visualize B-Tree operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${inter.className} bg-gray-50 text-gray-800 min-h-screen flex flex-col`}>
        <header className="bg-white shadow-md py-4 px-6">
          <h1 className="text-xl font-semibold">Day 34 - B-Tree Visualizer</h1>
        </header>
        <main className="flex-grow container mx-auto p-4">
          {children}
        </main>
        <footer className="text-center py-2 text-sm text-gray-500">
          100 Day Challenge - Day 34
        </footer>
      </body>
    </html>
  );
}
