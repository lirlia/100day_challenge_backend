import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="text-center">
      <h2 className="text-3xl font-semibold mb-8 text-cyan-300">ようこそ！</h2>
      <p className="mb-12 text-lg text-gray-300">
        このアプリケーションでは、認証局 (CA) の運営と ACME プロトコルによる証明書発行のシミュレーションを体験できます。
      </p>
      <div className="grid md:grid-cols-2 gap-8">
        <div className="p-6 rounded-lg shadow-xl bg-gray-800 hover:bg-gray-700 transition-colors duration-300">
          <h3 className="text-2xl font-semibold mb-4 text-teal-400">CA管理機能</h3>
          <p className="mb-6 text-gray-400">
            従来の認証局の役割として、手動での証明書発行要求 (CSR) の受付、証明書の発行、発行済み証明書の管理、失効処理などを行います。
          </p>
          <Link href="/ca-management"
            className="inline-block bg-teal-600 hover:bg-teal-500 text-white font-semibold py-3 px-6 rounded-lg shadow-md transition-transform transform hover:scale-105">
            CA管理画面へ
          </Link>
        </div>
        <div className="p-6 rounded-lg shadow-xl bg-gray-800 hover:bg-gray-700 transition-colors duration-300">
          <h3 className="text-2xl font-semibold mb-4 text-sky-400">ACMEクライアントシミュレーター</h3>
          <p className="mb-6 text-gray-400">
            ACMEプロトコルを利用して、ドメイン認証から証明書の自動発行・取得までの流れをシミュレートします。
          </p>
          <Link href="/acme-client"
            className="inline-block bg-sky-600 hover:bg-sky-500 text-white font-semibold py-3 px-6 rounded-lg shadow-md transition-transform transform hover:scale-105">
            ACMEクライアント画面へ
          </Link>
        </div>
      </div>
    </div>
  );
}
