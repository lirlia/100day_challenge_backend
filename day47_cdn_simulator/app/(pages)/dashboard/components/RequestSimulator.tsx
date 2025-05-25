'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { OriginContent, EdgeServer, RegionId, SimulationResult, EdgeServerWithCache } from '@/app/_lib/types';
import { REGIONS } from '@/app/_lib/types';
import NeumorphicCard from '@/components/ui/NeumorphicCard';
import NeumorphicButton from '@/components/ui/NeumorphicButton';
import { NeumorphicSelect } from '@/components/ui/NeumorphicFormControls';

interface RequestSimulatorProps {
  onSimulationComplete: (result: SimulationResult) => void; // Callback to update parent/sibling components
  edgeServers: EdgeServer[]; // Pass from parent to avoid re-fetching
  originContents: OriginContent[]; // Pass from parent
}

export default function RequestSimulator({ onSimulationComplete, edgeServers, originContents }: RequestSimulatorProps) {
  const [selectedRegion, setSelectedRegion] = useState<RegionId>(REGIONS[0]?.id || '');
  const [selectedContentId, setSelectedContentId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SimulationResult | null>(null);

  useEffect(() => {
    // Set initial content ID if available
    if (originContents.length > 0 && !selectedContentId) {
      setSelectedContentId(originContents[0].content_id);
    }
  }, [originContents, selectedContentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRegion || !selectedContentId) {
      setError("Please select a client region and a content ID.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setLastResult(null);

    try {
      const response = await fetch('/api/request-simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_region: selectedRegion, content_id: selectedContentId }),
      });
      const resultData: SimulationResult = await response.json();
      if (!response.ok) {
        throw new Error(resultData.message || 'Simulation request failed');
      }
      setLastResult(resultData);
      onSimulationComplete(resultData); // Notify parent
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <NeumorphicCard>
      <h2 className="text-2xl font-semibold text-neumorphism-accent mb-4">Request Simulator</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="clientRegion" className="block text-sm font-medium text-neumorphism-soft-text mb-1">Client Region</label>
          <NeumorphicSelect id="clientRegion" value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value as RegionId)} required>
            {REGIONS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NeumorphicSelect>
        </div>
        <div>
          <label htmlFor="contentIdSim" className="block text-sm font-medium text-neumorphism-soft-text mb-1">Content ID to Request</label>
          <NeumorphicSelect id="contentIdSim" value={selectedContentId} onChange={(e) => setSelectedContentId(e.target.value)} required disabled={originContents.length === 0}>
            {originContents.length === 0 && <option value="">No content available</option>}
            {originContents.map(oc => <option key={oc.id} value={oc.content_id}>{oc.content_id}</option>)}
          </NeumorphicSelect>
        </div>
        <NeumorphicButton type="submit" variant="accent" disabled={isLoading || originContents.length === 0 || edgeServers.length === 0}>
          {isLoading ? 'Simulating...' : (edgeServers.length === 0 ? 'No Edge Servers' : 'Simulate Request')}
        </NeumorphicButton>
      </form>

      {error && <p className="mt-4 text-red-500 text-sm">Error: {error}</p>}

      {lastResult && (
        <div className="mt-6 p-4 bg-neumorphism-bg shadow-neumorphism-inner rounded-neumorphism space-y-2 text-sm">
          <h3 className="text-lg font-semibold text-neumorphism-accent mb-2">Simulation Result:</h3>
          <p><strong>Message:</strong> {lastResult.message}</p>
          <p><strong>Served By:</strong> <span className={`font-medium ${lastResult.servedBy.startsWith('Origin') ? 'text-red-500' : 'text-green-500'}`}>{lastResult.servedBy}</span></p>
          <p><strong>Cache Status:</strong> <span className={`font-medium ${lastResult.cacheStatus === 'HIT' ? 'text-green-500' : (lastResult.cacheStatus.startsWith('MISS') ? 'text-yellow-500' : 'text-red-500')}`}>{lastResult.cacheStatus}</span></p>
          {lastResult.cachedItem && (
            <p><strong>Cached Item ID:</strong> {lastResult.cachedItem.original_content_id} (Expires: {new Date(lastResult.cachedItem.expires_at).toLocaleTimeString()})</p>
          )}
          {lastResult.evictedItem && (
            <p className="text-orange-500"><strong>Evicted Item ID:</strong> {lastResult.evictedItem.original_content_id}</p>
          )}
        </div>
      )}
    </NeumorphicCard>
  );
}
