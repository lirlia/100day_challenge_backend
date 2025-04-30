import Link from 'next/link';
import CacheBrowser from './cache-browser';

export const metadata = {
  title: 'キャッシュブラウザ - 分散キャッシュシステム',
};

export default function CacheBrowserPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">キャッシュブラウザ</h1>
        <div className="space-x-2">
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200"
          >
            ダッシュボード
          </Link>
          <Link
            href="/"
            className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200"
          >
            ← ホーム
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">キャッシュ操作</h2>
          <CacheBrowser />
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">使用方法</h2>
          <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <h3 className="font-medium text-gray-700 mb-2">キャッシュの基本操作</h3>
              <p className="text-sm text-gray-600">
                キーと値を入力して「設定」ボタンをクリックすると、キャッシュにデータが保存されます。
                TTL（有効期限）を指定すると、指定した秒数後にデータが自動的に削除されます。
              </p>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <h3 className="font-medium text-gray-700 mb-2">分散の仕組み</h3>
              <p className="text-sm text-gray-600">
                キャッシュキーは一貫性ハッシュアルゴリズムによって、適切なノードに割り当てられます。
                この仕組みにより、ノードの追加・削除時でも最小限のデータ移動で再配置が可能になります。
              </p>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <h3 className="font-medium text-gray-700 mb-2">レプリケーション</h3>
              <p className="text-sm text-gray-600">
                データは複数のノードにレプリケーション（複製）されます。
                プライマリノードにデータがない場合でも、レプリカから自動的に取得できます。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
