import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Day22 - 分散キャッシュシステム',
  description: '複数ノード間でのデータ分散を行うキャッシュシステムのシミュレーション',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <header className="bg-blue-600 text-white shadow-md">
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-xl font-bold">Day22 - 分散キャッシュシステム</h1>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="bg-gray-100 border-t border-gray-200 mt-auto">
          <div className="container mx-auto px-4 py-4 text-center text-gray-500 text-sm">
            &copy; 2025 分散キャッシュシステム - 100日チャレンジ
          </div>
        </footer>
      </body>
    </html>
  );
}
