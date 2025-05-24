import AcmeClientFlow from '../../../components/acme/AcmeClientFlow'; // エイリアスパスから相対パスに変更

export default function AcmeClientPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl md:text-6xl">
          <span className="block">Day 46</span>
          <span className="block text-indigo-600 dark:text-indigo-400">ACMEプロトコル体験クライアント</span>
        </h1>
        <p className="mt-3 text-base text-gray-500 dark:text-gray-400 sm:mt-5 sm:text-lg sm:max-w-xl md:mt-5 md:text-xl">
          このページでは、ACMEプロトコルによる証明書発行フローをステップバイステップで体験できます。
          アカウントの作成から、ドメインの所有権確認、証明書の発行・取得までをシミュレートします。
        </p>
      </header>
      <main>
        <AcmeClientFlow /> {/* 再度使用する */}
      </main>
      <footer className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>&copy; {new Date().getFullYear()} ACME CA Simulator. All rights reserved.</p>
      </footer>
    </div>
  );
}
