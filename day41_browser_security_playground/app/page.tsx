'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type User = {
  id: number;
  name: string;
  createdAt: string;
};

const securityFeatures = [
  { name: 'Content Security Policy (CSP)', path: '/demos/csp', description: 'XSS攻撃などを緩和するために、信頼できるコンテンツソースを定義します。' },
  { name: 'Cross-Origin Resource Sharing (CORS)', path: '/demos/cors', description: '異なるオリジン間でリソースを安全に共有する仕組みを学びます。' },
  { name: 'HTTP Strict Transport Security (HSTS)', path: '/demos/hsts', description: 'HTTPS接続を強制し、中間者攻撃のリスクを低減します。' },
  { name: 'X-Content-Type-Options', path: '/demos/x-content-type-options', description: 'MIMEタイプスニッフィングを禁止し、セキュリティを向上させます。' },
  { name: 'X-Frame-Options / CSP frame-ancestors', path: '/demos/x-frame-options', description: 'クリックジャッキング攻撃を防ぐため、iframe埋め込みを制御します。' },
  { name: 'Referrer-Policy', path: '/demos/referrer-policy', description: 'リファラ情報の送信ポリシーを制御し、プライバシーを保護します。' },
  { name: 'Permissions-Policy', path: '/demos/permissions-policy', description: 'ブラウザ機能へのアクセス許可をきめ細かく制御します。' },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="text-center">
        <h2 className="text-3xl font-semibold mb-4 text-sky-300">ようこそ！ブラウザセキュリティの世界へ</h2>
        <p className="text-lg text-gray-300 max-w-2xl mx-auto">
          このプレイグラウンドでは、ウェブサイトを保護するための重要なセキュリティ機能をインタラクティブに学ぶことができます。
          各機能を選択して、設定を変更し、その効果を実際に体験してみてください。
        </p>
      </section>

      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {securityFeatures.map((feature) => (
            <Link href={feature.path} key={feature.name} className="block p-0.5 rounded-lg bg-gradient-to-br from-sky-500 via-purple-500 to-pink-500 hover:scale-105 transition-transform duration-200 shadow-lg">
              <div className="h-full bg-gray-800 bg-opacity-80 backdrop-blur-md p-6 rounded-md hover:bg-opacity-70 transition-colors duration-200">
                <h3 className="text-xl font-semibold mb-2 text-sky-400">{feature.name}</h3>
                <p className="text-base text-gray-400">{feature.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
