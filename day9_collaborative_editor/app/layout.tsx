import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// const inter = Inter({ subsets: ["latin"] }); // フォントは一旦コメントアウト

export const metadata: Metadata = {
  title: "Collaborative Editor", // タイトル変更
  description: "Real-time collaborative text editor", // 説明変更
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
