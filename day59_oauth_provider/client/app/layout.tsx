import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Day59 - OIDC React Client",
  description: "OAuth2/OpenID Connect認証クライアントアプリケーション",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
