'use client';

import { useState } from 'react';
import UserSelector from './components/UserSelector';
import OrderForm from './components/OrderForm';
import OrderList from './components/OrderList';

export default function HomePage() {
  const [currentUserId, setCurrentUserId] = useState('user1');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleOrderCreated = () => {
    // 注文が作成されたら注文一覧を更新
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="space-y-6">
      {/* ユーザー選択セクション */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              現在のユーザー
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              操作を行うユーザーを選択してください
            </p>
          </div>
          <UserSelector
            currentUserId={currentUserId}
            onUserChange={setCurrentUserId}
          />
        </div>
      </div>

      {/* システム概要セクション */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg shadow p-6 text-white">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl mb-2">🔄</div>
            <h3 className="font-semibold mb-1">イベント駆動</h3>
            <p className="text-sm opacity-90">
              非同期メッセージでサービス間通信
            </p>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-2">⚡</div>
            <h3 className="font-semibold mb-1">リアルタイム</h3>
            <p className="text-sm opacity-90">
              注文状況をリアルタイムで監視
            </p>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-2">🛡️</div>
            <h3 className="font-semibold mb-1">堅牢性</h3>
            <p className="text-sm opacity-90">
              Sagaパターンで分散トランザクション
            </p>
          </div>
        </div>
      </div>

      {/* メインコンテンツ - 2カラムレイアウト */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 注文作成フォーム */}
        <div>
          <OrderForm
            userId={currentUserId}
            onOrderCreated={handleOrderCreated}
          />
        </div>

        {/* 注文一覧 */}
        <div>
          <OrderList
            userId={currentUserId}
            refreshTrigger={refreshTrigger}
          />
        </div>
      </div>

      {/* サービス状況セクション */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          システム構成
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <div className="w-3 h-3 bg-green-400 rounded-full mr-2"></div>
              <h3 className="font-medium text-gray-900 dark:text-white">注文サービス</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              注文管理とイベント発行
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              ポート: 8080
            </p>
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <div className="w-3 h-3 bg-green-400 rounded-full mr-2"></div>
              <h3 className="font-medium text-gray-900 dark:text-white">在庫サービス</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              在庫管理と予約処理
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              内部サービス
            </p>
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <div className="w-3 h-3 bg-green-400 rounded-full mr-2"></div>
              <h3 className="font-medium text-gray-900 dark:text-white">配送サービス</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              配送処理（90%成功率）
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              内部サービス
            </p>
          </div>
        </div>
      </div>

      {/* 使い方説明 */}
      <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-4">
          📋 使い方
        </h2>
        <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
          <p>1. 上部でユーザーを選択します</p>
          <p>2. 左側で商品をカートに追加して注文を作成します</p>
          <p>3. 右側で注文履歴と処理状況をリアルタイムで確認できます</p>
          <p>4. 注文は以下の状態を経由します：</p>
          <ul className="ml-4 space-y-1">
            <li>• <span className="font-medium">処理中</span> → 注文作成直後</li>
            <li>• <span className="font-medium">在庫確保済み</span> → 在庫が正常に確保された状態</li>
            <li>• <span className="font-medium">配送中</span> → 配送処理が開始された状態</li>
            <li>• <span className="font-medium">完了</span> → 全て正常に完了</li>
            <li>• <span className="font-medium">キャンセル</span> → 在庫不足または配送失敗</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
