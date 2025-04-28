import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Day19 - ジョブスケジューラ",
  description: "シンプルなジョブスケジューラアプリケーション",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          <header className="bg-blue-600 text-white shadow-md">
            <div className="container mx-auto px-4 py-4">
              <h1 className="text-2xl font-bold">Day19 - ジョブスケジューラ</h1>
              <nav className="mt-2">
                <ul className="flex space-x-4">
                  <li>
                    <a href="/" className="hover:underline">ホーム</a>
                  </li>
                  <li>
                    <a href="/jobs/new" className="hover:underline">新規ジョブ</a>
                  </li>
                </ul>
              </nav>
            </div>
          </header>
          <main className="container mx-auto px-4 py-8">
            {children}
          </main>
          <footer className="bg-gray-800 text-white py-4">
            <div className="container mx-auto px-4 text-center">
              <p>© 2025 ジョブスケジューラアプリ</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
