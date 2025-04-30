import Link from 'next/link';
import SimulationPanel from './simulation-panel';

export const metadata = {
  title: '障害シミュレーション - 分散キャッシュシステム',
};

export default function SimulationPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">障害シミュレーション</h1>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">シミュレーションパネル</h2>
          <SimulationPanel />
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">障害シナリオ</h2>
          <div className="space-y-4">
            <div className="bg-red-50 p-3 rounded-lg border border-red-200">
              <h3 className="font-medium text-red-700 mb-2">ノード停止</h3>
              <p className="text-sm text-red-600">
                ノードが完全に停止した状態をシミュレートします。
                このノードからのレスポンスは得られなくなります。
              </p>
            </div>

            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
              <h3 className="font-medium text-yellow-700 mb-2">低速応答</h3>
              <p className="text-sm text-yellow-600">
                ノードからの応答が遅くなる状態をシミュレートします。
                高負荷状態やネットワークの混雑を再現します。
              </p>
            </div>

            <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
              <h3 className="font-medium text-orange-700 mb-2">ネットワーク分断</h3>
              <p className="text-sm text-orange-600">
                ノードが他のノードと通信できない状態をシミュレートします。
                データは保持していますが、同期ができなくなります。
              </p>
            </div>

            <div className="bg-green-50 p-3 rounded-lg border border-green-200">
              <h3 className="font-medium text-green-700 mb-2">復旧</h3>
              <p className="text-sm text-green-600">
                障害状態のノードを通常状態に戻します。
                復旧時にデータの再同期プロセスが実行されます。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
