'use client';

import React, { useState, useEffect, useCallback } from 'react';
import OriginContentsManager from './components/OriginContentsManager';
import EdgeServerManager from './components/EdgeServerManager';
import RequestSimulator from './components/RequestSimulator';
import VisualizationLog from './components/VisualizationLog';
import EdgeServerCacheView from './components/EdgeServerCacheView';
import type { OriginContent, EdgeServer, RequestLog, SimulationResult, EdgeServerWithCache } from '@/app/_lib/types';

export default function DashboardPage() {
  // Shared state for data fetched by managers
  const [originContents, setOriginContents] = useState<OriginContent[]>([]);
  const [edgeServers, setEdgeServers] = useState<EdgeServer[]>([]);
  // State for simulation results and views
  const [requestLogs, setRequestLogs] = useState<RequestLog[]>([]);
  const [edgeServersWithCache, setEdgeServersWithCache] = useState<EdgeServerWithCache[]>([]);

  // --- Fetching initial data for managers & simulator ---
  const fetchAllOriginContents = useCallback(async () => {
    try {
      const response = await fetch('/api/origin-contents');
      if (!response.ok) throw new Error('Failed to fetch origin contents');
      const data = await response.json();
      setOriginContents(data);
    } catch (error) { console.error(error); }
  }, []);

  const fetchAllEdgeServers = useCallback(async () => {
    try {
      const response = await fetch('/api/edge-servers');
      if (!response.ok) throw new Error('Failed to fetch edge servers');
      const data: EdgeServer[] = await response.json();
      setEdgeServers(data);
      // Initialize EdgeServersWithCache with empty cache_items
      setEdgeServersWithCache(data.map(es => ({ ...es, cache_items: [], current_load: 0 })));
    } catch (error) { console.error(error); }
  }, []);

  useEffect(() => {
    fetchAllOriginContents();
    fetchAllEdgeServers();
  }, [fetchAllOriginContents, fetchAllEdgeServers]);

  // --- Callback for simulation completion ---
  const handleSimulationComplete = (result: SimulationResult) => {
    if (result.log) {
      setRequestLogs(prevLogs => [...prevLogs, result.log!].sort((a, b) => new Date(b.requested_at || 0).getTime() - new Date(a.requested_at || 0).getTime()));
    }
    if (result.updatedEdgeServer) {
      setEdgeServersWithCache(prev =>
        prev.map(es =>
          es.id === result.updatedEdgeServer!.id ? result.updatedEdgeServer! : es
        )
      );
    }
    // Potentially re-fetch all edge server cache states if a generic update is needed
    // For now, cdn-logic.ts should provide the specific updated server
  };

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
        {/* Column 1 & 2: Managers */}
        <section className="lg:col-span-2 space-y-8">
          {/* Pass reload functions to managers so they can update the shared state */}
          <OriginContentsManager
            key={originContents.length} // Re-render on content change to pass updated list to simulator
            onContentsChanged={fetchAllOriginContents}
          />
          <EdgeServerManager
            key={edgeServers.length} // Re-render on server change
            onServersChanged={fetchAllEdgeServers}
          />
           <RequestSimulator
            edgeServers={edgeServers}
            originContents={originContents}
            onSimulationComplete={handleSimulationComplete}
          />
        </section>

        {/* Column 3: Visualization & Stats */}
        <aside className="lg:col-span-1 space-y-8">
          <VisualizationLog logs={requestLogs} edgeServers={edgeServers} />
          <EdgeServerCacheView edgeServersWithCache={edgeServersWithCache} />

          <div className="bg-neumorphism-bg p-6 rounded-lg shadow-neumorphism-soft dark:bg-neumorphism-bg-dark dark:shadow-neumorphism-soft-dark">
            <h2 className="text-2xl font-semibold mb-4 text-neumorphism-accent">Statistics</h2>
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
