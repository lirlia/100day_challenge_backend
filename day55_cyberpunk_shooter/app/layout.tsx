import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Day55 - Cyberpunk Shooter",
  description: "A cyberpunk themed 3D space shooter game.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="bg-black text-white">
      <body className={`${inter.className} h-screen flex flex-col`}>{children}</body>
    </html>
  );
}
