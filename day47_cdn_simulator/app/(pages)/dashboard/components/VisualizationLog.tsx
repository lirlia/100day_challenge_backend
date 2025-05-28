'use client';

import React from 'react';
import type { RequestLog, EdgeServer } from '@/app/_lib/types';
import { REGIONS } from '@/app/_lib/types';
import NeumorphicCard from '@/components/ui/NeumorphicCard';

interface VisualizationLogProps {
  logs: RequestLog[];
  edgeServers: EdgeServer[];
}

export default function VisualizationLog({ logs, edgeServers }: VisualizationLogProps) {
  const getEdgeServerName = (id: number | null | undefined): string => {
    if (id === null || id === undefined) return 'N/A';
    const server = edgeServers.find(s => s.id === id);
    return server ? server.server_id : 'Unknown Edge';
  };

  const getRegionName = (regionId: string): string => {
    return REGIONS.find(r => r.id === regionId)?.name || regionId;
  };

  return (
    <NeumorphicCard>
      <h2 className="text-2xl font-semibold text-neumorphism-accent mb-4">Request & Cache Visualization Log</h2>
      {logs.length === 0 ? (
        <p className="text-neumorphism-soft-text">No request logs yet. Run a simulation to see logs here.</p>
      ) : (
        <div className="space-y-3 max-h-[1175px] overflow-y-auto pr-2">
          {logs.slice().reverse().map((log) => (
            <div key={log.id} className="text-xs p-3 bg-neumorphism-bg shadow-neumorphism-concave dark:bg-neumorphism-bg-dark dark:shadow-neumorphism-concave-dark rounded-neumorphism">
              <p className="font-semibold">
                <span className="text-neumorphism-accent">[{new Date(log.requested_at || Date.now()).toLocaleTimeString()}]</span>
                Client ({getRegionName(log.client_region)}) requested <span className="text-blue-500">{log.content_id_requested}</span>
              </p>
              <p>
                &raquo; Served by: <span className={`font-medium ${log.served_by_edge_server_id ? 'text-green-600' : 'text-red-600'}`}>{log.served_by_edge_server_id ? getEdgeServerName(log.served_by_edge_server_id) : 'Origin Server'}</span>
              </p>
              <p>
                &raquo; Cache Status:
                <span className={`font-medium ${log.cache_hit ? 'text-green-500' : 'text-yellow-500'}`}>{log.cache_hit ? 'HIT' : 'MISS'}</span>
              </p>
              <p>
                &raquo; Fetched from Origin:
                <span className={`font-medium ${log.delivered_from_origin ? 'text-red-500' : 'text-gray-400'}`}>{log.delivered_from_origin ? 'Yes' : 'No'}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </NeumorphicCard>
  );
}
