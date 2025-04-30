import Link from 'next/link';
import NodeList from './node-list';

export const metadata = {
  title: 'システムダッシュボード - 分散キャッシュシステム',
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">システムダッシュボード</h1>
        <Link
          href="/"
          className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200"
        >
          ← ホームに戻る
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">クラスタ状態</h2>
          <div className="flex flex-wrap gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex-1">
              <div className="text-green-600 text-sm font-medium">アクティブノード</div>
              <div className="text-xl font-bold" id="active-nodes-count">-</div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex-1">
              <div className="text-yellow-600 text-sm font-medium">キャッシュアイテム</div>
              <div className="text-xl font-bold" id="cache-items-count">-</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex-1">
              <div className="text-blue-600 text-sm font-medium">レプリケーション</div>
              <div className="text-xl font-bold" id="replications-count">-</div>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">操作</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/cache-browser"
              className="bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg p-3 flex-1 text-center transition"
            >
              <div className="text-green-700 font-medium">キャッシュブラウザ</div>
            </Link>
            <Link
              href="/simulation"
              className="bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg p-3 flex-1 text-center transition"
            >
              <div className="text-purple-700 font-medium">障害シミュレーション</div>
            </Link>
            <div
              id="rebalance-btn"
              className="bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg p-3 flex-1 text-center cursor-pointer transition"
            >
              <div className="text-blue-700 font-medium">再バランス</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">ノード一覧</h2>
          <button
            id="add-node-btn"
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
          >
            + ノード追加
          </button>
        </div>

        <NodeList />
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-3">最近のイベント</h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">時間</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">イベント</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">詳細</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200" id="events-table-body">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-center text-sm text-gray-500">
                  読み込み中...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
