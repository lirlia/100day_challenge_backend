'use client';

import { useEffect, useState } from 'react';
import type { FireworksShow } from './api/fireworksshows/route'; // APIルートから型をインポート

export default function HomePage() {
  const [shows, setShows] = useState<FireworksShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchShows() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/fireworksshows');
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(
            `Failed to fetch fireworks shows: ${res.status} ${res.statusText} - ${errorData.error || 'Unknown error'}`
          );
        }
        const data: FireworksShow[] = await res.json();
        setShows(data);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchShows();
    // TODO: Add polling or SSE/WebSocket for real-time updates
  }, []);

  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Day 29 - Fireworks Dashboard</h1>

      {loading && <p>Loading FireworksShows...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}

      {!loading && !error && (
        <div>
          <h2 className="text-xl font-semibold mb-2">Active Fireworks Shows</h2>
          {shows.length === 0 ? (
            <p>No active FireworksShows found.</p>
          ) : (
            <ul className="space-y-2">
              {shows.map((show) => (
                <li key={show.metadata.uid} className="p-3 border rounded shadow-sm">
                  <p><strong>Name:</strong> {show.metadata.name} ({show.metadata.namespace})</p>
                  <p><strong>Phase:</strong> {show.status?.phase || '-'}</p>
                  <p><strong>Duration:</strong> {show.spec.durationSeconds}s</p>
                  <p><strong>Intensity:</strong> {show.spec.intensity}</p>
                  <p><strong>Launched:</strong> {show.status?.launchedPods ?? '-'} / Active: {show.status?.activePods ?? '-'} / Failed: {show.status?.failedPods ?? '-'}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
