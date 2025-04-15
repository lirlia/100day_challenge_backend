import type { Metadata } from "next";
import "@/app/globals.css";
import { UserProvider } from './components/UserSwitcher';
import { CartProvider } from './components/CartContext';
import Header from './components/Header';

export const metadata: Metadata = {
  title: "シンプルECサイト",
  description: "Next.jsで作成したシンプルなECサイトアプリケーション",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
