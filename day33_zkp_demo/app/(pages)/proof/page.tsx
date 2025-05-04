"use client";

import { useState } from "react";
import Image from "next/image";

export default function ProofPage() {
  // ステップ管理: 1=秘密入力, 2=クイズ体験, 3=体験完了
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [secret, setSecret] = useState("");
  const [input, setInput] = useState("");
  const [challenge, setChallenge] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [logs, setLogs] = useState<{challenge: string, response: string, isSuccess: boolean}[]>([]);

  // クイズ生成（例: 秘密の文字数を問う）
  const generateChallenge = () => {
    // 実際はもっとZKPらしいものに拡張可
    return `秘密の単語の文字数は？`;
  };

  // クイズ出題
  const startProof = () => {
    setChallenge(generateChallenge());
    setStep(2);
    setResult(null);
    setInput("");
  };

  // 回答判定
  const checkAnswer = () => {
    const isSuccess = input === String(secret.length);
    setResult(isSuccess ? "正解！あなたは秘密を知っています" : "不正解…秘密は明かされませんでした");
    setLogs([
      ...logs,
      { challenge, response: input, isSuccess }
    ]);
    setInput("");
  };

  // 体験リセット
  const reset = () => {
    setStep(1);
    setSecret("");
    setInput("");
    setChallenge("");
    setResult(null);
    setLogs([]);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-yellow-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-lg w-full mx-auto p-8 bg-white/90 dark:bg-gray-900/90 rounded-2xl shadow-lg flex flex-col items-center">
        <Image
          src="/treasure-chest.png"
          alt="宝箱のイラスト"
          width={100}
          height={100}
          className="mb-4"
        />
        <h2 className="text-2xl font-bold mb-2 text-yellow-700 dark:text-yellow-300">宝箱の中身を知っていることを証明しよう</h2>
        <p className="mb-4 text-gray-700 dark:text-gray-200 text-center">
          <span className="font-semibold text-blue-600 dark:text-blue-300">秘密の内容は絶対に見せません！</span><br />
          でも「知っている」ことは証明できます。
        </p>

        {step === 1 && (
          <div className="w-full flex flex-col items-center">
            <label className="mb-2 text-gray-600 dark:text-gray-300">宝箱の中身（秘密の単語）を入力してください</label>
            <input
              type="password"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              className="w-full px-4 py-2 border rounded mb-4 dark:bg-gray-800 dark:border-gray-600"
              placeholder="例: ひみつのことば"
            />
            <button
              className="px-6 py-2 bg-yellow-400 hover:bg-yellow-500 text-white font-bold rounded-full shadow"
              disabled={!secret}
              onClick={startProof}
            >
              証明スタート
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="w-full flex flex-col items-center">
            <div className="mb-4 p-4 bg-blue-50 dark:bg-gray-800 rounded shadow text-center">
              <span className="font-semibold text-blue-700 dark:text-blue-200">クイズ:</span> {challenge}
            </div>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              className="w-full px-4 py-2 border rounded mb-4 dark:bg-gray-800 dark:border-gray-600"
              placeholder="答えを入力"
            />
            <button
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-full shadow"
              onClick={checkAnswer}
              disabled={!input}
            >
              答える
            </button>
            {result && (
              <div className={`mt-4 p-3 rounded text-center font-bold ${result.startsWith('正解') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {result}
                <button
                  className="ml-4 px-4 py-1 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded"
                  onClick={reset}
                >
                  もう一度体験
                </button>
              </div>
            )}
          </div>
        )}

        <div className="w-full mt-8">
          <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">体験ログ</h3>
          <ul className="space-y-2">
            {logs.map((log, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Q: {log.challenge}</span>
                <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">A: {log.response}</span>
                <span className={`px-2 py-1 rounded ${log.isSuccess ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>{log.isSuccess ? '正解' : '不正解'}</span>
              </li>
            ))}
            {logs.length === 0 && <li className="text-gray-400">まだ体験ログはありません</li>}
          </ul>
        </div>

        <div className="w-full mt-8 p-4 bg-yellow-100 dark:bg-yellow-900 rounded text-yellow-800 dark:text-yellow-200 text-center">
          <span className="font-bold">図解:</span> <br />
          <span className="inline-block mt-2">あなたの「秘密」は <span className="bg-gray-300 px-2 rounded">●●●●</span> のまま、<br />
          サーバや他の人には絶対に送信されません！</span>
        </div>
      </div>
    </main>
  );
}
