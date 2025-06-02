import type { Metadata } from "next";
import { Orbitron, Rajdhani } from "next/font/google";
import "./globals.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-orbitron",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-rajdhani",
});

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
      <body className={`${orbitron.variable} ${rajdhani.variable} min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black overflow-x-hidden font-orbitron`}>
        {/* 背景アニメーション */}
        <div className="fixed inset-0 z-0">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_50%,_theme(colors.neon-blue)_0%,_transparent_50%)] opacity-20 animate-pulse"></div>
          <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_80%_20%,_theme(colors.neon-pink)_0%,_transparent_50%)] opacity-20 animate-pulse" style={{animationDelay: '1s'}}></div>
          <div className="absolute bottom-0 left-0 w-full h-full bg-[radial-gradient(circle_at_40%_80%,_theme(colors.neon-green)_0%,_transparent_50%)] opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
        </div>

        {/* メインコンテンツ */}
        <main className="relative z-10 flex min-h-screen flex-col items-center justify-center p-4">
          {children}
        </main>

        {/* 装飾的なグリッドライン */}
        <div className="fixed inset-0 z-0 opacity-10">
          <div className="w-full h-full" style={{
            backgroundImage: 'linear-gradient(rgba(0,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,255,0.3) 1px, transparent 1px)',
            backgroundSize: '50px 50px'
          }}></div>
        </div>
      </body>
    </html>
  );
}
