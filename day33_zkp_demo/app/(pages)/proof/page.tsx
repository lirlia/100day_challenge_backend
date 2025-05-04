"use client";

import { useState } from "react";
import Image from "next/image";

// クイズの種類
const quizTypes = [
  // 文字数
  (secret: string) => ({
    question: `秘密の単語の文字数は？`,
    answer: String(secret.length),
    explain: '秘密の長さだけを答えます。'
  }),
  // n文字目
  (secret: string) => {
    if (secret.length < 2) return null;
    const n = Math.floor(Math.random() * secret.length);
    return {
      question: `${n + 1}文字目は？`,
      answer: secret[n],
      explain: `秘密の${n + 1}文字目だけを答えます。`
    };
  },
  // 最初の文字
  (secret: string) => ({
    question: `最初の文字は？`,
    answer: secret[0],
    explain: '秘密の最初の文字だけを答えます。'
  }),
  // 最後の文字
  (secret: string) => ({
    question: `最後の文字は？`,
    answer: secret[secret.length - 1],
    explain: '秘密の最後の文字だけを答えます。'
  }),
  // 母音の数
  (secret: string) => {
    const vowels = 'あいうえおアイウエオaeiouAEIOU';
    const count = [...secret].filter(c => vowels.includes(c)).length;
    return {
      question: `母音はいくつ？`,
      answer: String(count),
      explain: '母音の数だけを答えます。'
    };
  },
  // 特定の文字が含まれるか
  (secret: string) => {
    const chars = 'あいうえおabcde';
    const pick = chars[Math.floor(Math.random() * chars.length)];
    return {
      question: `「${pick}」は含まれますか？（はい/いいえ）`,
      answer: secret.includes(pick) ? 'はい' : 'いいえ',
      explain: `その文字が含まれるかだけを答えます。`
    };
  },
];

function getRandomQuiz(secret: string) {
  // 有効なクイズのみ抽出
  const candidates = quizTypes
    .map(fn => fn(secret))
    .filter(q => q && secret.length > 0);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

const TOTAL_QUIZZES = 3;

export default function ProofPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1:秘密入力, 2:証明中, 3:証明完了
  const [secret, setSecret] = useState("");
  const [input, setInput] = useState("");
  const [quiz, setQuiz] = useState<{question: string, answer: string, explain: string} | null>(null);
  const [logs, setLogs] = useState<{question: string, response: string, answer: string, isSuccess: boolean}[]>([]);
  const [currentQuiz, setCurrentQuiz] = useState(1);
  const [result, setResult] = useState<null | 'success' | 'fail'>(null);

  // 証明スタート
  const startProof = () => {
    setLogs([]);
    setCurrentQuiz(1);
    setResult(null);
    setInput("");
    setQuiz(getRandomQuiz(secret));
    setStep(2);
  };

  // 回答判定
  const checkAnswer = () => {
    if (!quiz) return;
    const isSuccess = input.trim() === quiz.answer;
    setLogs(prev => [
      ...prev,
      { question: quiz.question, response: input, answer: quiz.answer, isSuccess }
    ]);
    setInput("");
    if (!isSuccess) {
      setResult('fail');
      setStep(3);
      return;
    }
    if (currentQuiz === TOTAL_QUIZZES) {
      setResult('success');
      setStep(3);
      return;
    }
    // 次のクイズへ
    setCurrentQuiz(currentQuiz + 1);
    setQuiz(getRandomQuiz(secret));
  };

  // 再挑戦
  const reset = () => {
    setStep(1);
    setSecret("");
    setInput("");
    setQuiz(null);
    setLogs([]);
    setCurrentQuiz(1);
    setResult(null);
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
              type="text"
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

        {step === 2 && quiz && (
          <div className="w-full flex flex-col items-center">
            <div className="mb-2 p-4 bg-blue-50 dark:bg-gray-800 rounded shadow text-center">
              <span className="font-semibold text-blue-700 dark:text-blue-200">クイズ {currentQuiz} / {TOTAL_QUIZZES}:</span> {quiz.question}
            </div>
            <div className="mb-4 text-xs text-gray-500 dark:text-gray-400">{quiz.explain}</div>
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
          </div>
        )}

        {step === 3 && (
          <div className="w-full flex flex-col items-center">
            {result === 'success' ? (
              <div className="mt-4 p-4 rounded text-center font-bold bg-green-100 text-green-700">
                おめでとうございます！<br />あなたは本当に秘密を知っていることを証明できました！
              </div>
            ) : (
              <div className="mt-4 p-4 rounded text-center font-bold bg-red-100 text-red-700">
                残念…途中で間違えたため証明失敗です。<br />もう一度チャレンジしてみましょう。
              </div>
            )}
            <button
              className="mt-4 px-6 py-2 bg-yellow-400 hover:bg-yellow-500 text-white font-bold rounded-full shadow"
              onClick={reset}
            >
              もう一度体験
            </button>
          </div>
        )}

        <div className="w-full mt-8">
          <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">体験ログ</h3>
          <ul className="space-y-2">
            {logs.map((log, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Q: {log.question}</span>
                <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">A: {log.response}</span>
                <span className={`px-2 py-1 rounded ${log.isSuccess ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>{log.isSuccess ? '正解' : `不正解（正: ${log.answer}）`}</span>
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
