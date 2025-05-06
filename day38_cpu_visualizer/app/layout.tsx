import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Day38 - CPU Visualizer",
  description: "A simple CPU visualizer built with Next.js for Day38 of the 100-day challenge.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        {children}
      </body>
    </html>
  );
}
