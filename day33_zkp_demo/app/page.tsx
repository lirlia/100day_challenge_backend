'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function Home() {
  const router = useRouter();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-yellow-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-xl w-full mx-auto p-8 bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-lg flex flex-col items-center">
        <Image
          src="/treasure-chest.png"
          alt="宝箱のイラスト"
          width={120}
          height={120}
          className="mb-4 rounded-xl shadow"
        />
        <h1 className="text-3xl font-bold mb-2 text-center text-yellow-700 dark:text-yellow-300 drop-shadow">Day33 - ゼロ知識証明 "体験型" デモアプリ</h1>
        <p className="text-lg text-gray-700 dark:text-gray-200 text-center mb-6">
          秘密の内容は絶対に明かさず、<br />
          "知っている"ことだけを証明できる<br />
          <span className="font-semibold text-blue-600 dark:text-blue-300">ゼロ知識証明</span>の"魔法"を体験しよう！
        </p>
        <ul className="text-gray-600 dark:text-gray-300 text-base mb-8 list-disc list-inside text-left">
          <li>宝箱の中身（秘密）は絶対に見せません</li>
          <li>でも「知っている」ことは証明できます</li>
          <li>クイズ形式で直感的に体験</li>
          <li>ITが苦手な人でも安心のやさしいUI</li>
        </ul>
        <button
          className="mt-2 px-8 py-3 bg-yellow-400 hover:bg-yellow-500 text-white text-lg font-bold rounded-full shadow transition"
          onClick={() => router.push('/proof')}
        >
          証明体験をはじめる
        </button>
      </div>
      <footer className="mt-10 text-gray-400 text-sm text-center">
        &copy; 2025 Day33 ZKP Demo / 100日チャレンジ
      </footer>
    </main>
  );
}
