'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { FireworksShow } from './api/fireworksshows/route'; // APIルートから型をインポート
import { V1Pod } from '@kubernetes/client-node'; // Podの型をインポート
import { motion, AnimatePresence } from 'framer-motion'; // Import framer-motion

// SSEイベントのデータ型
interface FireworksSSEEventData {
  type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK';
  object: FireworksShow;
}

interface PodSSEEventData {
  type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK';
  object: V1Pod;
}

// Podリスト表示コンポーネント
interface PodListProps {
  show: FireworksShow;
}

// 表示するPodの最大数を多めに設定（アニメーションで消えるため）
const MAX_PODS_IN_MEMORY = 100;
// 完了/失敗したPodを表示しておく時間 (ミリ秒)
const POD_LINGER_DURATION = 2000;

// --- Representing an animating Pod ---
interface AnimatingPod {
  pod: V1Pod;
  id: string; // uid
  targetX: number; // 0 to 1 (percentage of screen width)
  targetY: number; // 0 to 1 (percentage of screen height from bottom)
  fadingOut?: boolean; // Optional: To trigger exit animation manually if needed
}

// --- FireworksPod Component (New) ---
interface FireworksPodProps {
  animatingPod: AnimatingPod;
  containerHeight: number;
  onComplete: (id: string) => void; // Callback when animation (or linger) finishes
}

const POD_LINGER_DURATION_MS = 1500; // How long Succeeded/Failed pods stay visible

function FireworksPod({ animatingPod, containerHeight, onComplete }: FireworksPodProps) {
  const { pod, id, targetX, targetY } = animatingPod;
  const status = pod.status?.phase;
  const hasCompleted = status === 'Succeeded' || status === 'Failed';

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    if (hasCompleted) {
      // When pod completes, set a timer to remove it after lingering
      timeoutId = setTimeout(() => {
        onComplete(id);
      }, POD_LINGER_DURATION_MS);
    }

    // Cleanup function to clear the timeout if the component unmounts
    // or if the status changes before the timeout finishes
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [hasCompleted, id, onComplete]);

  const screenX = `${targetX * 100}%`;
  // targetY=0 is bottom, targetY=1 is top. We animate from bottom (100vh) to targetY.
  const screenY = `${(1 - targetY) * 100}%`;
  const initialY = containerHeight + 50; // Start below the screen

  const podColor = getPodStatusColorVisual(status);

  return (
    <motion.div
      layout // Prevent jumps when items are removed
      key={id}
      initial={{ x: screenX, y: initialY, scale: 0.5, opacity: 0 }}
      animate={{
        x: screenX,
        y: screenY,
        scale: 1,
        opacity: hasCompleted ? 0.5 : 1, // Fade slightly on completion
        transition: { duration: 1.5, type: 'spring', damping: 15, stiffness: 50 }
      }}
      exit={{
        opacity: 0,
        scale: 0.3,
        transition: { duration: 0.5 }
      }}
      className={`absolute w-3 h-3 rounded-full shadow-lg ${podColor}`}
      title={`${pod.metadata?.name} (${status})`}
    />
  );
}

// Helper for visual status color (simplified)
function getPodStatusColorVisual(phase?: string): string {
  switch (phase) {
    case 'Pending': return 'bg-yellow-400';
    case 'Running': return 'bg-green-500';
    case 'Succeeded': return 'bg-blue-500'; // Will fade out
    case 'Failed': return 'bg-red-600';    // Will fade out
    default: return 'bg-gray-400';
  }
}

// Podステータスに応じたTailwindカラーを返すヘルパー
function getPodStatusColor(phase?: string): string {
  switch (phase) {
    case 'Pending': return 'bg-yellow-500';
    case 'Running': return 'bg-green-600';
    case 'Succeeded': return 'bg-blue-600';
    case 'Failed': return 'bg-red-600';
    case 'Unknown':
    default: return 'bg-gray-500';
  }
}

// Helper for relative time
function timeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m ago";
  return Math.floor(seconds) + "s ago";
}

export default function HomePage() {
  const [shows, setShows] = useState<FireworksShow[]>([]);
  const [animatingPods, setAnimatingPods] = useState<AnimatingPod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fireworksEventSourceRef = useRef<EventSource | null>(null);
  const podEventSources = useRef<Map<string, EventSource>>(new Map()); // Map<showUid, EventSource>
  const containerRef = useRef<HTMLDivElement>(null); // Ref for container height
  const [containerHeight, setContainerHeight] = useState(0);

  // Update container height on mount and resize
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.offsetHeight);
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Initial FireworksShow fetch
  const fetchInitialShows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fireworksshows');
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(`Failed fetch: ${res.status} - ${errorData.error || 'Unknown'}`);
      }
      const data: FireworksShow[] = await res.json();
      setShows(data);
      // Connect to pod streams for existing shows on initial load
      data.forEach(show => {
        if (show.metadata.uid && show.metadata.namespace && show.metadata.name && !podEventSources.current.has(show.metadata.uid)) {
          connectToPodStream(show.metadata.namespace, show.metadata.name, show.metadata.uid);
        }
      });
    } catch (err: any) {
      console.error('Error fetching initial shows:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // FireworksShow SSE Connection
  useEffect(() => {
    fetchInitialShows();

    console.log('Connecting to FireworksShow SSE...');
    const eventSource = new EventSource('/api/fireworksshows/stream');
    fireworksEventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('FireworksShow SSE opened.');
      setError(null);
    };
    eventSource.onerror = (e) => {
      console.error('FireworksShow SSE error:', e);
      setError('Show updates connection error.');
    };
    eventSource.onmessage = (event) => {
      try {
        const eventData: FireworksSSEEventData = JSON.parse(event.data);
        if (eventData.type === 'BOOKMARK') return;
        const show = eventData.object;
        const showUid = show.metadata.uid;

        setShows((prevShows) => {
          const idx = prevShows.findIndex(s => s.metadata.uid === showUid);
          if (eventData.type === 'ADDED') {
            return idx === -1 ? [...prevShows, show] : prevShows.map(s => s.metadata.uid === showUid ? show : s);
          } else if (eventData.type === 'MODIFIED') {
            return idx !== -1 ? prevShows.map(s => s.metadata.uid === showUid ? show : s) : [...prevShows, show];
          } else if (eventData.type === 'DELETED') {
            return prevShows.filter(s => s.metadata.uid !== showUid);
          }
          return prevShows;
        });

        // Connect/Disconnect Pod SSE
        if (!showUid || !show.metadata.namespace || !show.metadata.name) return;
        if (eventData.type === 'ADDED' || eventData.type === 'MODIFIED') {
          if (!podEventSources.current.has(showUid)) {
            connectToPodStream(show.metadata.namespace, show.metadata.name, showUid);
          }
        } else if (eventData.type === 'DELETED') {
          disconnectFromPodStream(showUid);
          // Remove pods for deleted show
          setAnimatingPods(prev => prev.filter(p => p.pod.metadata?.labels?.['fireworks-show'] !== show.metadata?.name || p.pod.metadata?.namespace !== show.metadata?.namespace));
        }
      } catch (parseError) {
        console.error('Error parsing Show SSE:', parseError);
      }
    };

    return () => {
      console.log('Closing FireworksShow SSE.');
      fireworksEventSourceRef.current?.close();
      podEventSources.current.forEach((source, key) => disconnectFromPodStream(key));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchInitialShows]);

  // --- Function to connect to a specific Pod stream ---
  const connectToPodStream = useCallback((namespace: string, showName: string, showUid: string) => {
    console.log(`Connecting to Pod SSE for ${showName}...`);
    const url = `/api/fireworksshows/${namespace}/${showName}/pods/stream`;
    const eventSource = new EventSource(url);
    podEventSources.current.set(showUid, eventSource);

    eventSource.onopen = () => console.log(`Pod SSE for ${showName} opened.`);
    eventSource.onerror = (e) => {
      console.error(`Pod SSE error for ${showName}:`, e);
      if (eventSource.readyState === EventSource.CLOSED) {
        console.warn(`Pod stream for ${showName} closed.`);
        disconnectFromPodStream(showUid);
      }
    };
    eventSource.onmessage = (event) => {
      try {
        const eventData: PodSSEEventData = JSON.parse(event.data);
        if (eventData.type === 'BOOKMARK') return;
        const pod = eventData.object;
        const podUid = pod.metadata?.uid;
        if (!podUid) return;

        setAnimatingPods((prevPods) => {
          const existingIndex = prevPods.findIndex(p => p.id === podUid);
          let nextPods = [...prevPods];

          if (eventData.type === 'ADDED') {
            if (existingIndex === -1) {
              const randomX = Math.random(); // Generate random X
              const randomY = 0.1 + Math.random() * 0.8; // Wider range: 0.1 to 0.9
              console.log(`Calculated targetX: ${randomX.toFixed(3)}`); // Log the value
              const newAnimatingPod: AnimatingPod = {
                pod: pod,
                id: podUid,
                targetX: randomX,
                targetY: randomY,
              };
              console.log(`Adding pod ${pod.metadata?.name} at ${newAnimatingPod.targetX.toFixed(2)}, ${newAnimatingPod.targetY.toFixed(2)}`);
              nextPods = [newAnimatingPod, ...prevPods];
            }
          } else if (eventData.type === 'MODIFIED') {
            if (existingIndex !== -1) {
              nextPods[existingIndex] = { ...nextPods[existingIndex], pod: pod };
            } else {
              const randomX = Math.random(); // Generate random X
              const randomY = 0.1 + Math.random() * 0.8; // Use wider range here too
              console.log(`Calculated targetX (MODIFIED): ${randomX.toFixed(3)}`); // Log the value
              const newAnimatingPod: AnimatingPod = {
                pod: pod,
                id: podUid,
                targetX: randomX,
                targetY: randomY,
              };
              nextPods = [newAnimatingPod, ...prevPods];
            }
          } else if (eventData.type === 'DELETED') {
            nextPods = prevPods.filter(p => p.id !== podUid);
          }
          return nextPods;
        });
      } catch (parseError) {
        console.error('Error parsing Pod SSE:', parseError);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Function to disconnect from a specific Pod stream ---
  const disconnectFromPodStream = useCallback((showUid: string) => {
    if (podEventSources.current.has(showUid)) {
      console.log(`Disconnecting from Pod SSE for show ${showUid}...`);
      podEventSources.current.get(showUid)?.close();
      podEventSources.current.delete(showUid);
    }
  }, []);

  // --- Function to remove a completed pod animation ---
  const handlePodAnimationComplete = useCallback((podId: string) => {
    setAnimatingPods((prev) => prev.filter(p => p.id !== podId));
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-gray-900" ref={containerRef}>
      {/* Show Header Info (Optional) */}
      <div className="absolute top-4 left-4 text-white text-sm bg-black bg-opacity-50 p-2 rounded z-10">
        <h1 className="text-lg font-bold mb-1">Fireworks Dashboard</h1>
        {shows.map(s => <div key={s.metadata.uid}>{s.metadata.name} ({s.status?.phase || '-'})</div>)}
        <div>Animating Pods: {animatingPods.length}</div>
      </div>

      {/* Grid for Pods */}
      {/* Adjust grid columns, gap, padding, and ensure full width/height */}
      <div className="flex-grow grid grid-cols-12 gap-1 p-1 overflow-hidden w-full h-full">
        <AnimatePresence>
          {animatingPods.map((ap) => (
            <FireworksPod
              key={ap.id}
              animatingPod={ap}
              containerHeight={containerHeight}
              onComplete={handlePodAnimationComplete}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Loading/Error indicators (less obtrusive) */}
      {loading && <div className="absolute bottom-4 left-4 text-xs text-yellow-300 z-10">Loading...</div>}
      {error && <div className="absolute bottom-4 left-4 text-xs text-red-400 z-10">Error: {error}</div>}
    </main>
  );
}
