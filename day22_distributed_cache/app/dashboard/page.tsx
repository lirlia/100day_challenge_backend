import { Suspense } from 'react';
import NodeList from './components/NodeList';
import ClusterStatus from './components/ClusterStatus';
import CacheBrowser from './components/CacheBrowser';
import SimulationPanel from './components/SimulationPanel';

export const metadata = {
  title: 'Day22 - Dashboard',
};

export default function DashboardPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* <h1 className="text-4xl font-bold mb-8 text-center text-gray-800">分散キャッシュ管理ダッシュボード</h1> */}

      <div className="flex flex-wrap -mx-3">
        <div className="w-full md:w-2/3 px-3 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-md h-full">
            <Suspense fallback={<div>Loading cluster status...</div>}>
              <ClusterStatus />
            </Suspense>
          </div>
        </div>

        <div className="w-full md:w-1/3 px-3 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-md h-full">
            <h2 className="text-xl font-bold mb-4">ノード管理</h2>
            <Suspense fallback={<div>Loading node list...</div>}>
              <NodeList />
            </Suspense>
          </div>
        </div>

        <div className="w-full md:w-2/3 px-3 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-md h-full">
            <h2 className="text-xl font-bold mb-4">キャッシュブラウザ</h2>
            <Suspense fallback={<div>Loading cache browser...</div>}>
              <CacheBrowser />
            </Suspense>
          </div>
        </div>

        <div className="w-full md:w-1/3 px-3 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-md h-full">
            <h2 className="text-xl font-bold mb-4">障害シミュレーション</h2>
            <Suspense fallback={<div>Loading simulation panel...</div>}>
              <SimulationPanel />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
