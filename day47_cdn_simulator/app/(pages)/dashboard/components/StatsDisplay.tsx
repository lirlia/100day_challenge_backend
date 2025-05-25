'use client';

import React, { useState, useEffect, useCallback } from 'react';
import NeumorphicCard from '@/components/ui/NeumorphicCard';
import { REGIONS } from '@/app/_lib/types';

interface StatItemProps {
  label: string;
  value: string | number;
  unit?: string;
}

const StatItem: React.FC<StatItemProps> = ({ label, value, unit }) => (
  <div className="p-3 bg-neumorphism-bg shadow-neumorphism-concave dark:bg-neumorphism-bg-dark dark:shadow-neumorphism-concave-dark rounded-neumorphism">
    <p className="text-sm text-neumorphism-soft-text">{label}</p>
    <p className="text-xl font-semibold text-neumorphism-accent">
      {value} <span className="text-sm font-normal text-neumorphism-soft-text">{unit}</span>
    </p>
  </div>
);

interface StatsData {
  totalRequests: number;
  cacheHits: number;
  cacheHitRate: number;
  requestsByRegion: { client_region: string; count: number }[];
  contentPopularity: { content_id_requested: string; count: number }[];
}

export default function StatsDisplay() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/statistics');
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.details || 'Failed to fetch statistics');
      }
      const data = await response.json();
      setStats(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    // Optionally, set up an interval to refresh stats periodically
    const intervalId = setInterval(fetchStats, 30000); // Refresh every 30 seconds
    return () => clearInterval(intervalId);
  }, [fetchStats]);

  const getRegionName = (regionId: string): string => {
    return REGIONS.find(r => r.id === regionId)?.name || regionId;
  };

  if (isLoading && !stats) {
    return (
      <NeumorphicCard>
        <h2 className="text-2xl font-semibold text-neumorphism-accent mb-4">Statistics</h2>
        <p className="text-neumorphism-soft-text">Loading statistics...</p>
      </NeumorphicCard>
    );
  }

  if (error) {
    return (
      <NeumorphicCard>
        <h2 className="text-2xl font-semibold text-neumorphism-accent mb-4">Statistics</h2>
        <p className="text-red-500">Error loading statistics: {error}</p>
      </NeumorphicCard>
    );
  }

  if (!stats) {
    return (
      <NeumorphicCard>
        <h2 className="text-2xl font-semibold text-neumorphism-accent mb-4">Statistics</h2>
        <p className="text-neumorphism-soft-text">No statistics available yet.</p>
      </NeumorphicCard>
    );
  }

  return (
    <NeumorphicCard>
      <h2 className="text-2xl font-semibold text-neumorphism-accent mb-6">CDN Performance Statistics</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <StatItem label="Total Requests" value={stats.totalRequests} />
        <StatItem label="Cache Hits" value={stats.cacheHits} />
        <StatItem label="Cache Hit Rate" value={stats.cacheHitRate.toFixed(2)} unit="%" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold mb-3 text-neumorphism-soft-text">Requests by Region</h3>
          {stats.requestsByRegion.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {stats.requestsByRegion.map(regionStat => (
                <li key={regionStat.client_region} className="flex justify-between p-1.5 bg-neumorphism-bg shadow-neumorphism-input rounded-neumorphism">
                  <span>{getRegionName(regionStat.client_region)}:</span>
                  <span className="font-medium">{regionStat.count}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-neumorphism-soft-text italic">No regional data.</p>}
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-3 text-neumorphism-soft-text">Top Content (by Requests)</h3>
          {stats.contentPopularity.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {stats.contentPopularity.map(contentStat => (
                <li key={contentStat.content_id_requested} className="flex justify-between p-1.5 bg-neumorphism-bg shadow-neumorphism-input rounded-neumorphism">
                  <span className="truncate max-w-[70%]">{contentStat.content_id_requested}:</span>
                  <span className="font-medium">{contentStat.count}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-neumorphism-soft-text italic">No content popularity data.</p>}
        </div>
      </div>
    </NeumorphicCard>
  );
}
