import { Suspense } from 'react';
import Link from 'next/link';
import NodeList from './node-list';
import ClusterStatus from './cluster-status';

export const metadata = {
  title: 'Day22 - Dashboard',
};

export default function DashboardPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">分散キャッシュダッシュボード</h1>

      <div className="flex gap-4 mb-6">
        <Link
          href="/cache-browser"
          className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md"
        >
          キャッシュブラウザ
        </Link>
        <Link
          href="/simulation"
          className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-md"
        >
          障害シミュレーション
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <Suspense fallback={<div>Loading cluster status...</div>}>
            <ClusterStatus />
          </Suspense>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-bold mb-4">ノード管理</h2>
          <Suspense fallback={<div>Loading node list...</div>}>
            <NodeList />
          </Suspense>
        </div>
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
