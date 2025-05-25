'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { EdgeServer } from '@/app/_lib/types';
import { REGIONS } from '@/app/_lib/types';
import NeumorphicCard from '@/components/ui/NeumorphicCard';
import NeumorphicButton from '@/components/ui/NeumorphicButton';
import NeumorphicInput, { NeumorphicSelect } from '@/components/ui/NeumorphicFormControls';

interface EdgeServerManagerProps {
  onServersChanged: () => void; // Callback to notify parent of changes
}

export default function EdgeServerManager({ onServersChanged }: EdgeServerManagerProps) {
  const [servers, setServers] = useState<EdgeServer[]>([]);
  const [newServerId, setNewServerId] = useState('');
  const [newRegion, setNewRegion] = useState(REGIONS[0]?.id || '');
  const [newCacheCapacity, setNewCacheCapacity] = useState('100');
  const [newDefaultTtl, setNewDefaultTtl] = useState('3600');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchServers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/edge-servers');
      if (!response.ok) throw new Error(`Failed to fetch servers: ${response.statusText}`);
      const data = await response.json();
      setServers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    const capacity = parseInt(newCacheCapacity, 10);
    const ttl = parseInt(newDefaultTtl, 10);

    if (!newServerId.trim() || !newRegion || isNaN(capacity) || capacity <= 0 || isNaN(ttl) || ttl < 0) {
      setError("All fields are required and must be valid (Capacity > 0, TTL >= 0).");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/edge-servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_id: newServerId,
          region: newRegion,
          cache_capacity: capacity,
          default_ttl: ttl,
        }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.details || `Failed to add server: ${response.statusText}`);
      }
      setNewServerId('');
      await fetchServers();
      onServersChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/edge-servers?server_id=${encodeURIComponent(serverId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.details || `Failed to delete server: ${response.statusText}`);
      }
      await fetchServers();
      onServersChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <NeumorphicCard className="space-y-6">
      <h2 className="text-2xl font-semibold text-neumorphism-accent">Edge Server Configuration</h2>
      <form onSubmit={handleAddServer} className="space-y-4">
        <div>
          <label htmlFor="serverId" className="block text-sm font-medium text-neumorphism-soft-text mb-1">Server ID</label>
          <NeumorphicInput id="serverId" type="text" value={newServerId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewServerId(e.target.value)} placeholder="e.g., edge-tokyo-1" required />
        </div>
        <div>
          <label htmlFor="region" className="block text-sm font-medium text-neumorphism-soft-text mb-1">Region</label>
          <NeumorphicSelect id="region" value={newRegion} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewRegion(e.target.value)} required>
            {REGIONS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NeumorphicSelect>
        </div>
        <div>
          <label htmlFor="cacheCapacity" className="block text-sm font-medium text-neumorphism-soft-text mb-1">Cache Capacity (items)</label>
          <NeumorphicInput id="cacheCapacity" type="number" value={newCacheCapacity} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCacheCapacity(e.target.value)} placeholder="e.g., 100" min="1" required />
        </div>
        <div>
          <label htmlFor="defaultTtl" className="block text-sm font-medium text-neumorphism-soft-text mb-1">Default TTL (seconds)</label>
          <NeumorphicInput id="defaultTtl" type="number" value={newDefaultTtl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewDefaultTtl(e.target.value)} placeholder="e.g., 3600" min="0" required />
        </div>
        <NeumorphicButton type="submit" variant="accent" disabled={isLoading}>
          {isLoading ? 'Adding...' : 'Add Edge Server'}
        </NeumorphicButton>
      </form>

      {error && <p className="text-red-500 text-sm">Error: {error}</p>}

      <div className="mt-6">
        <h3 className="text-xl font-semibold mb-3">Configured Edge Servers</h3>
        {isLoading && servers.length === 0 && <p>Loading servers...</p>}
        {!isLoading && servers.length === 0 && <p className="text-neumorphism-soft-text">No edge servers configured yet.</p>}
        {servers.length > 0 && (
          <ul className="space-y-3">
            {servers.map((server) => (
              <li key={server.id} className="p-3 bg-neumorphism-bg shadow-neumorphism-concave dark:bg-neumorphism-bg-dark dark:shadow-neumorphism-concave-dark rounded-neumorphism flex justify-between items-center">
                <div>
                  <p className="font-medium">ID: {server.server_id} ({REGIONS.find(r=>r.id === server.region)?.name || server.region})</p>
                  <p className="text-xs text-neumorphism-soft-text">Capacity: {server.cache_capacity} items, TTL: {server.default_ttl}s</p>
                </div>
                <NeumorphicButton variant="danger" size="sm" onClick={() => handleDeleteServer(server.server_id)} disabled={isLoading}>
                  Delete
                </NeumorphicButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </NeumorphicCard>
  );
}
