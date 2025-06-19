import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Day67: CRDT システム | Conflict-free Replicated Data Types",
  description: "分散システムでの無競合データレプリケーションを体験できるインタラクティブなCRDTシステム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-[var(--cyber-bg)] text-[var(--cyber-white)]">
        <main className="relative min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
