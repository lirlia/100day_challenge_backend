'use client';

import React from 'react';
import type { EdgeServerWithCache, EdgeCacheItem } from '@/app/_lib/types';
import { REGIONS } from '@/app/_lib/types';
import NeumorphicCard from '@/components/ui/NeumorphicCard';

interface EdgeServerCacheViewProps {
  edgeServersWithCache: EdgeServerWithCache[];
}

export default function EdgeServerCacheView({ edgeServersWithCache }: EdgeServerCacheViewProps) {
  const getRegionName = (regionId: string): string => {
    return REGIONS.find(r => r.id === regionId)?.name || regionId;
  };

  return (
    <NeumorphicCard>
      <h2 className="text-2xl font-semibold text-neumorphism-accent mb-6">Edge Server Cache States</h2>
      {edgeServersWithCache.length === 0 ? (
        <p className="text-neumorphism-soft-text">No edge servers configured or no cache data available.</p>
      ) : (
        <div className="space-y-6">
          {edgeServersWithCache.map(server => (
            <NeumorphicCard key={server.id} className="shadow-neumorphism-inner">
              <h3 className="text-lg font-semibold text-neumorphism-accent mb-3">
                {server.server_id} <span className="text-sm font-normal text-neumorphism-soft-text">({getRegionName(server.region)})</span> - Capacity: {server.cache_items?.length || 0} / {server.cache_capacity}
              </h3>
              {server.cache_items && server.cache_items.length > 0 ? (
                <ul className="space-y-2 text-xs">
                  {server.cache_items.map(item => (
                    <li key={item.id} className="p-2 bg-neumorphism-bg shadow-neumorphism-concave dark:bg-neumorphism-bg-dark dark:shadow-neumorphism-concave-dark rounded-neumorphism">
                      <p><strong>Content ID:</strong> {item.original_content_id}</p>
                      <p><strong>Cached:</strong> {new Date(item.cached_at).toLocaleTimeString()}</p>
                      <p><strong>Expires:</strong> {new Date(item.expires_at).toLocaleTimeString()} <span className={new Date(item.expires_at) < new Date() ? 'text-red-500' : 'text-green-500'}>{new Date(item.expires_at) < new Date() ? '(Expired)' : '(Active)'}</span></p>
                      <p><strong>Last Accessed:</strong> {new Date(item.last_accessed_at).toLocaleTimeString()}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neumorphism-soft-text italic">Cache is empty.</p>
              )}
            </NeumorphicCard>
          ))}
        </div>
      )}
    </NeumorphicCard>
  );
}
