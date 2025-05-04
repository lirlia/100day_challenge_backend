"use client";

import { useState } from "react";
import Image from "next/image";

// 簡易Schnorr Protocol体験用のパラメータ
const G = 5; // generator
const P = 23; // prime（小さい値で体験用）

function modPow(base: number, exp: number, mod: number): number {
  let result = 1;
  base = base % mod;
  while (exp > 0) {
    if (exp % 2 === 1) result = (result * base) % mod;
    exp = Math.floor(exp / 2);
    base = (base * base) % mod;
  }
  return result;
}

export default function SchnorrZKPPage() {
  // ステップ: 1=秘密入力, 2=証明体験, 3=完了
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [secret, setSecret] = useState(""); // x
  const [publicKey, setPublicKey] = useState<number | null>(null); // y = g^x mod p
  const [challenge, setChallenge] = useState<number | null>(null); // e
  const [commitment, setCommitment] = useState<number | null>(null); // t = g^r mod p
  const [r, setR] = useState(""); // ランダム値
  const [s, setS] = useState(""); // s = r + e*x
  const [result, setResult] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  // 公開鍵計算
  const handleSetSecret = () => {
    const x = Number(secret);
    if (isNaN(x) || x <= 0) {
      setResult("秘密は正の整数で入力してください");
      return;
    }
    const y = modPow(G, x, P);
    setPublicKey(y);
    setStep(2);
    setResult(null);
    setLog([`秘密xを設定（非公開）`, `公開鍵y = g^x mod p = ${G}^${x} mod ${P} = ${y}`]);
  };

  // コミットメント生成
  const handleCommit = () => {
    const rv = Number(r);
    if (isNaN(rv) || rv < 0) {
      setResult("rは0以上の整数で入力してください");
      return;
    }
    const t = modPow(G, rv, P);
    setCommitment(t);
    // チャレンジ（e）は0 or 1をランダムでサーバ（今回はUI）が出す
    const e = Math.floor(Math.random() * 2);
    setChallenge(e);
    setResult(null);
    setLog(prev => [...prev, `コミットメントt = g^r mod p = ${G}^${rv} mod ${P} = ${t}`, `チャレンジe = ${e}`]);
  };

  // s計算・証明
  const handleProve = () => {
    const x = Number(secret);
    const rv = Number(r);
    if (isNaN(x) || isNaN(rv)) return;
    if (challenge === null) return;
    // s = r + e*x
    const sVal = rv + challenge * x;
    setS(String(sVal));
    // 検証: g^s ≡ t * y^e (mod p)
    const y = publicKey!;
    const left = modPow(G, sVal, P);
    const right = (commitment! * modPow(y, challenge, P)) % P;
    const ok = left === right;
    setResult(ok ? "証明成功！あなたは秘密xを知っています" : "証明失敗…計算が合いません");
    setLog(prev => [...prev, `s = r + e*x = ${rv} + ${challenge}*${x} = ${sVal}`, `検証: g^s = ${left}, t*y^e = ${right}`, ok ? "証明成功！" : "証明失敗…"]);
    setStep(3);
  };

  const reset = () => {
    setStep(1);
    setSecret("");
    setPublicKey(null);
    setChallenge(null);
    setCommitment(null);
    setR("");
    setS("");
    setResult(null);
    setLog([]);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-blue-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-xl w-full mx-auto p-8 bg-white/90 dark:bg-gray-900/90 rounded-2xl shadow-lg flex flex-col items-center">
        <Image src="/treasure-chest.png" alt="宝箱のイラスト" width={80} height={80} className="mb-2" />
        <h1 className="text-2xl font-bold mb-2 text-blue-700 dark:text-blue-300">裏モード：Schnorr Protocol 体験</h1>
        <p className="mb-4 text-gray-700 dark:text-gray-200 text-center">
          本格的なゼロ知識証明（Schnorr Protocol）を体験できます。<br />
          <span className="text-xs text-gray-500">※体験用に小さい素数・生成元を使っています</span>
        </p>
        <div className="w-full mb-4 p-3 bg-blue-50 dark:bg-gray-800 rounded text-xs text-blue-900 dark:text-blue-200">
          <b>パラメータ:</b> g = {G}, p = {P}
        </div>

        {step === 1 && (
          <div className="w-full flex flex-col items-center">
            <label className="mb-2 text-gray-600 dark:text-gray-300">秘密x（正の整数）を入力してください</label>
            <input
              type="number"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              className="w-full px-4 py-2 border rounded mb-4 dark:bg-gray-800 dark:border-gray-600"
              placeholder="例: 7"
            />
            <button
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-full shadow"
              disabled={!secret}
              onClick={handleSetSecret}
            >
              公開鍵を生成して証明体験へ
            </button>
          </div>
        )}

        {step === 2 && publicKey !== null && (
          <div className="w-full flex flex-col items-center">
            <div className="mb-2 text-sm text-gray-700 dark:text-gray-200">公開鍵y = g^x mod p = {publicKey}</div>
            <label className="mb-2 text-gray-600 dark:text-gray-300">ランダムな整数rを入力（例: 3）</label>
            <input
              type="number"
              value={r}
              onChange={e => setR(e.target.value)}
              className="w-full px-4 py-2 border rounded mb-4 dark:bg-gray-800 dark:border-gray-600"
              placeholder="例: 3"
            />
            <button
              className="px-6 py-2 bg-yellow-400 hover:bg-yellow-500 text-white font-bold rounded-full shadow mb-4"
              disabled={!r}
              onClick={handleCommit}
            >
              コミットメント送信
            </button>
            {challenge !== null && commitment !== null && (
              <>
                <div className="mb-2 text-sm text-gray-700 dark:text-gray-200">チャレンジe = {challenge}</div>
                <button
                  className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-full shadow"
                  onClick={handleProve}
                >
                  sを計算して証明！
                </button>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="w-full flex flex-col items-center">
            <div className={`mt-4 p-4 rounded text-center font-bold ${result?.includes('成功') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{result}</div>
            <button
              className="mt-4 px-6 py-2 bg-yellow-400 hover:bg-yellow-500 text-white font-bold rounded-full shadow"
              onClick={reset}
            >
              もう一度体験
            </button>
          </div>
        )}

        <div className="w-full mt-8">
          <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">体験ログ・計算過程</h3>
          <ul className="space-y-1 text-xs">
            {log.map((l, i) => (
              <li key={i} className="text-gray-700 dark:text-gray-300">{l}</li>
            ))}
            {log.length === 0 && <li className="text-gray-400">まだ体験ログはありません</li>}
          </ul>
        </div>

        <div className="w-full mt-8 p-4 bg-blue-100 dark:bg-blue-900 rounded text-blue-800 dark:text-blue-200 text-xs">
          <b>【Schnorr Protocolの流れ】</b><br />
          1. 証明者は秘密xを持ち、公開鍵y = g^x mod pを公開<br />
          2. 証明者はランダムなrでt = g^r mod pを計算しコミットメント送信<br />
          3. 検証者（サーバ）はチャレンジe（0 or 1）を出す<br />
          4. 証明者はs = r + e*xを計算し送信<br />
          5. 検証者はg^s ≡ t * y^e (mod p) で検証<br />
          <span className="block mt-2">このプロトコルにより「xを知らずに」検証者が納得できます！</span>
        </div>

        <div className="w-full mt-6 text-center">
          <a href="/proof" className="text-sm text-yellow-600 hover:underline dark:text-yellow-300">
            ← もっと直感的な魔法体験へ戻る
          </a>
        </div>
      </div>
    </main>
  );
}
