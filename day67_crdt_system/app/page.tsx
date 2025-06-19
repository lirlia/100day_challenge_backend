'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type User = {
  id: number;
  name: string;
  createdAt: string;
};

export default function HomePage() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ユーザー一覧を取得
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/users');
      const data = await response.json();
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('ユーザー情報の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  // ユーザーを作成
  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });

      if (response.ok) {
        setName('');
        fetchUsers();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'ユーザー作成に失敗しました。');
      }
    } catch (err) {
      console.error('Error creating user:', err);
      setError('ユーザー作成に失敗しました。');
    }
  };

  // 初回マウント時にユーザー一覧を取得
  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div className="min-h-screen p-6">
      {/* ヘッダー */}
      <header className="mb-12 text-center">
        <h1 className="text-6xl font-bold mb-4 glitch neon-text-green" data-text="CRDT NEXUS">
          CRDT NEXUS
        </h1>
        <p className="text-xl neon-text-blue mb-2">
          Day67 - Conflict-free Replicated Data Types System
        </p>
        <p className="text-gray-400 max-w-3xl mx-auto">
          分散システムでの無競合データレプリケーションを体験。
          Google Docs、Figmaなどで使われる最先端技術の核心を学習しましょう。
        </p>
      </header>

      {/* 統計ダッシュボード */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold neon-text-pink mb-6 text-center">
          ＞ システム状態
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-6xl mx-auto">
          <div className="cyber-card p-6 text-center data-stream">
            <div className="text-3xl font-bold neon-text-green mb-2">3</div>
            <div className="text-sm text-gray-400">アクティブノード</div>
          </div>
          <div className="cyber-card p-6 text-center pulse-glow">
            <div className="text-3xl font-bold neon-text-blue mb-2">7</div>
            <div className="text-sm text-gray-400">CRDTタイプ</div>
          </div>
          <div className="cyber-card p-6 text-center hologram">
            <div className="text-3xl font-bold neon-text-purple mb-2">0</div>
            <div className="text-sm text-gray-400">同期競合</div>
          </div>
          <div className="cyber-card p-6 text-center">
            <div className="text-3xl font-bold neon-text-pink mb-2">100%</div>
            <div className="text-sm text-gray-400">ネットワーク接続</div>
          </div>
        </div>
      </section>

      {/* CRDTタイプ一覧 */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold neon-text-green mb-6 text-center">
          ＞ 実装済みCRDT データ型
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {[
            {
              name: 'G-Counter',
              desc: '増加専用カウンター',
              icon: '↗️',
              color: 'green',
              path: '/crdt/g-counter'
            },
            {
              name: 'PN-Counter',
              desc: '増減可能カウンター',
              icon: '↕️',
              color: 'blue',
              path: '/crdt/pn-counter'
            },
            {
              name: 'G-Set',
              desc: '追加専用セット',
              icon: '📦',
              color: 'purple',
              path: '/crdt/g-set'
            },
            {
              name: 'OR-Set',
              desc: '追加・削除可能セット',
              icon: '🔄',
              color: 'pink',
              path: '/crdt/or-set'
            },
            {
              name: 'LWW-Register',
              desc: '最後書き込み勝利',
              icon: '⏰',
              color: 'green',
              path: '/crdt/lww-register'
            },
            {
              name: 'RGA',
              desc: '文字列・配列操作',
              icon: '📝',
              color: 'blue',
              path: '/crdt/rga'
            },
            {
              name: 'AWORMap',
              desc: 'キー・バリューマップ',
              icon: '🗂️',
              color: 'purple',
              path: '/crdt/awormap'
            }
          ].map((crdt, index) => (
            <Link key={index} href={crdt.path}>
              <div className={`cyber-card p-6 hover:scale-105 transition-all duration-300 cursor-pointer neon-border-${crdt.color} group`}>
                <div className="text-center">
                  <div className="text-4xl mb-3">{crdt.icon}</div>
                  <h3 className={`text-xl font-bold mb-2 neon-text-${crdt.color} group-hover:text-white`}>
                    {crdt.name}
                  </h3>
                  <p className="text-gray-400 text-sm">{crdt.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* デモアプリケーション */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold neon-text-pink mb-6 text-center">
          ＞ デモアプリケーション
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {[
            {
              title: '協調テキストエディタ',
              desc: 'リアルタイム文書編集',
              tech: 'RGA',
              icon: '📄',
              path: '/demos/text-editor',
              color: 'green'
            },
            {
              title: '共有カウンター',
              desc: '分散カウンター集計',
              tech: 'G-Counter, PN-Counter',
              icon: '🔢',
              path: '/demos/counter',
              color: 'blue'
            },
            {
              title: '協調TODOリスト',
              desc: 'チーム作業管理',
              tech: 'OR-Set',
              icon: '✅',
              path: '/demos/todo',
              color: 'purple'
            },
            {
              title: '分散投票システム',
              desc: 'リアルタイム投票・集計',
              tech: 'AWORMap',
              icon: '🗳️',
              path: '/demos/voting',
              color: 'pink'
            },
            {
              title: '共有設定管理',
              desc: '分散設定同期',
              tech: 'LWW-Register',
              icon: '⚙️',
              path: '/demos/settings',
              color: 'green'
            },
            {
              title: 'ネットワーク可視化',
              desc: 'ノード・同期状況表示',
              tech: 'System Monitor',
              icon: '🌐',
              path: '/network',
              color: 'blue'
            }
          ].map((demo, index) => (
            <Link key={index} href={demo.path}>
              <div className={`cyber-card p-8 hover:scale-105 transition-all duration-300 cursor-pointer group h-full`}>
                <div className="text-center">
                  <div className="text-5xl mb-4">{demo.icon}</div>
                  <h3 className={`text-xl font-bold mb-3 neon-text-${demo.color} group-hover:text-white`}>
                    {demo.title}
                  </h3>
                  <p className="text-gray-400 mb-3">{demo.desc}</p>
                  <div className={`text-xs neon-text-${demo.color} opacity-70`}>
                    {demo.tech}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* フッター */}
      <footer className="text-center py-8">
        <div className="cyber-card inline-block px-8 py-4">
          <p className="text-gray-400">
            🚀 <span className="neon-text-green">CRDT</span> でゼロ競合な分散システムを体験
          </p>
          <div className="mt-2 text-xs text-gray-500">
            Powered by Next.js + TypeScript + SQLite
          </div>
        </div>
      </footer>
    </div>
  );
}
