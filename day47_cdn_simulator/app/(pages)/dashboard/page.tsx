import OriginContentsManager from './components/OriginContentsManager';
import EdgeServerManager from './components/EdgeServerManager';
// Placeholder imports for other components to be added later
// import RequestSimulator from './components/RequestSimulator';
// import VisualizationLog from './components/VisualizationLog';
// import StatsDisplay from './components/StatsDisplay';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-neumorphism-bg text-neumorphism-text p-4 md:p-8">
      <header className="mb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-neumorphism-accent mb-2">
          Day47 - CDN Simulator
        </h1>
        <p className="text-lg text-neumorphism-soft-text">
          コンテンツ配信ネットワークの動作をシミュレートします。
        </p>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2 space-y-8">
          <OriginContentsManager />
          <EdgeServerManager />
        </section>

        <aside className="lg:col-span-1 space-y-8">
          <div className="bg-neumorphism-bg p-6 rounded-lg shadow-neumorphism-soft dark:bg-neumorphism-bg-dark dark:shadow-neumorphism-soft-dark">
            <h2 className="text-2xl font-semibold mb-4 text-neumorphism-accent">Request Simulator</h2>
            {/* Placeholder for RequestSimulator */}
            <p className="text-sm text-neumorphism-soft-text">リクエストをシミュレートするエリアです。 (Coming soon)</p>
          </div>
          <div className="bg-neumorphism-bg p-6 rounded-lg shadow-neumorphism-soft dark:bg-neumorphism-bg-dark dark:shadow-neumorphism-soft-dark">
            <h2 className="text-2xl font-semibold mb-4 text-neumorphism-accent">Visualization Log</h2>
            {/* Placeholder for VisualizationLog */}
            <p className="text-sm text-neumorphism-soft-text">配信プロセスのログ表示エリアです。 (Coming soon)</p>
          </div>
          <div className="bg-neumorphism-bg p-6 rounded-lg shadow-neumorphism-soft dark:bg-neumorphism-bg-dark dark:shadow-neumorphism-soft-dark">
            <h2 className="text-2xl font-semibold mb-4 text-neumorphism-accent">Statistics</h2>
            {/* Placeholder for StatsDisplay */}
            <p className="text-sm text-neumorphism-soft-text">統計情報の表示エリアです。 (Coming soon)</p>
          </div>
        </aside>
      </main>

      <footer className="mt-16 pt-8 border-t border-neumorphism-border dark:border-gray-700 text-center">
        <p className="text-sm text-neumorphism-soft-text">
          &copy; {new Date().getFullYear()} CDN Simulator. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
