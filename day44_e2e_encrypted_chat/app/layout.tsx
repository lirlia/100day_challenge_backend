import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Day44 - E2E Encrypted Chat",
  description: "E2E encrypted chat application with Neumorphism design",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${inter.className} antialiased`}>
        <main className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8">
        {children}
        </main>
      </body>
    </html>
  );
}
