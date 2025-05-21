import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Day44 - Go Virtual Router',
  description: 'Manage Go virtual routers',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${inter.className} bg-slate-900 text-slate-50 flex flex-col min-h-screen`}>
        <header className="bg-slate-800 p-4 shadow-md">
          <h1 className="text-2xl font-bold text-sky-400">Go Virtual Router Control Panel</h1>
        </header>
        <main className="flex-grow container mx-auto p-4">{children}</main>
        <footer className="bg-slate-800 p-4 text-center text-sm text-slate-400">
          <p>&copy; {new Date().getFullYear()} Go Virtual Router Project</p>
        </footer>
      </body>
    </html>
  );
}
