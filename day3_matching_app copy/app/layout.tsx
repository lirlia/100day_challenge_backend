import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { getAllUsers } from './_lib/users' // サーバーサイドで全ユーザー取得
import AppLayout from './AppLayout' // クライアントコンポーネントのレイアウト
import { CurrentUserProvider } from '../context/CurrentUserContext' // Provider をインポート

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'マッチングアプリ',
  description: '100日チャレンジ Day3: マッチングアプリ',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const users = await getAllUsers(); // サーバーコンポーネントでデータ取得

  return (
    <html lang="ja">
      <body className={inter.className}>
        <CurrentUserProvider>
          <div className="min-h-screen bg-gray-50">
            <header className="bg-white shadow-sm">
              <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
                <h1 className="text-xl font-bold text-pink-600">マッチングアプリ</h1>
                <nav>
                  <ul className="flex space-x-4">
                    <li>
                      <a href="/" className="text-gray-600 hover:text-pink-600">
                        マッチング
                      </a>
                    </li>
                    <li>
                      <a href="/avatar-demo" className="text-gray-600 hover:text-pink-600">
                        アバタードモ
                      </a>
                    </li>
                  </ul>
                </nav>
              </div>
            </header>
            <AppLayout users={users}>
              {children}
            </AppLayout>
          </div>
        </CurrentUserProvider>
      </body>
    </html>
  )
}
