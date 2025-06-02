import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Day54 - 派手派手オセロバトル",
  description: "とにかく演出が派手なオセロゲーム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center p-4">
          {children}
        </main>
      </body>
    </html>
  );
}
