import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Day 10: GraphQL Media App",
  description: "Exploring GraphQL with Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${inter.className} flex h-screen bg-gray-100`}>
        <Toaster position="top-right" />
        {/* Left Column (Navigation + Main Content Area) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* TODO: Add Navigation Header/Sidebar if needed */}
          <header className="bg-white shadow-sm p-4">
            <h1 className="text-xl font-semibold">Day 10: GraphQL Media App</h1>
            {/* Simple Navigation for now */}
            <nav className="mt-2">
              <Link href="/" className="text-blue-600 hover:underline mr-4">
                Movies
              </Link>
              <a href="/books" className="text-blue-600 hover:underline">Books</a>
            </nav>
          </header>
          <main className="flex-1 overflow-y-auto p-6">
            {/* Page content will be rendered here */}
            {children}
          </main>
        </div>

        {/* Right Column (GraphQL Viewer Area) - Placeholder */}
        {/* This area will be populated dynamically by pages later */}
        {/* We might need context or state management to pass data here */}
        {/* Or pass the viewer component down through children */}
        {/* For simplicity now, pages will render their own viewer */}
        {/* <div className="w-1/3 bg-gray-200 p-4 border-l border-gray-300 overflow-y-auto">
          <h2 className="text-lg font-semibold mb-2">GraphQL Request/Response</h2>
          <p>Details will appear here...</p>
        </div> */}
      </body>
    </html>
  );
}
