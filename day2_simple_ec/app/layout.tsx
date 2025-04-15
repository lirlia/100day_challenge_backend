'use client'; // クライアントコンポーネントにする

import { useEffect } from 'react'; // useEffect をインポート
import type { Metadata } from "next";
import "@/app/globals.css";
import { UserProvider } from './components/UserSwitcher';
import { CartProvider } from './components/CartContext';
import Header from './components/Header';

// メタデータはクライアントコンポーネントでは直接 export できないため、
// 必要であれば head.tsx を使うか、別の方法で設定する必要があります。
// 今回は一旦コメントアウトします。
// export const metadata: Metadata = {
//   title: "シンプルECサイト",
//   description: "Next.jsで作成したシンプルなECサイトアプリケーション",
// };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 価格更新APIを定期的に呼び出す処理
  useEffect(() => {
    console.log('Setting up interval for price update...');
    const intervalId = setInterval(async () => {
      console.log('Triggering price update API...');
      try {
        const response = await fetch('/api/products/update-prices', {
          method: 'POST'
        });
        if (response.ok) {
          const data = await response.json();
          console.log('Price update API response:', data.message);
        } else {
          console.error('Price update API failed:', response.statusText);
        }
      } catch (error) {
        console.error('Error calling price update API:', error);
      }
    }, 10000); // 10秒ごとに実行

    // クリーンアップ関数
    return () => {
      console.log('Clearing interval for price update.');
      clearInterval(intervalId);
    };
  }, []); // 空の依存配列で、マウント時に一度だけ実行

  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50">
        <UserProvider>
          <CartProvider>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-grow container mx-auto px-4 py-8">
                {children}
              </main>
              <footer className="bg-gray-800 text-white py-6">
                <div className="container mx-auto px-4 text-center">
                  <p>&copy; 2025 シンプルECサイト</p>
                </div>
              </footer>
            </div>
          </CartProvider>
        </UserProvider>
      </body>
    </html>
  );
}
