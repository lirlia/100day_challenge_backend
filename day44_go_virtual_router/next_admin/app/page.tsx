'use client';

import React, { useState, useCallback, useEffect, type FormEvent } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  BackgroundVariant,
  Position,
  type NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';

interface GoRouterInfo {
  id: string;
  tunName: string;
  ip: string;
  numRoutes: number;
  // neighbors: any; // For now, not directly used in nodes
}

interface CustomRouterNodeData {
  routerId: string; // Original Go router ID
  label: string; // Label for display, e.g., "router-A (tun0)"
  ip: string;
  // type?: 'custom' // Node自体がtypeを持つので、dataの中にtypeは不要なことが多い
}

interface RoutingEntry {
  Network: string;
  NextHop: string;
  NextHopRouterID: string;
  Interface: string;
  Metric: number;
  LearnedFrom: string;
  LastUpdated: string; // Consider Date type if manipulating
}

interface ConnectionInfo {
  id: string;
  router1Id: string;
  router2Id: string;
  createdAt: string; // Assuming string from Go's time.Time JSON marshal
}

// AppNode 型の定義は useNodesState のジェネリックとしては使わない
// type AppNode = Node<CustomRouterNodeData>;

// API base URL
const API_BASE_URL = 'http://localhost:8080/api';

export default function HomePage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<CustomRouterNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedRouterId, setSelectedRouterId] = useState<string | null>(null);
  const [routingTables, setRoutingTables] = useState<Record<string, RoutingEntry[]>>({});

  // Form state for creating a router
  const [newRouterId, setNewRouterId] = useState('');
  const [newRouterIpCIDR, setNewRouterIpCIDR] = useState('');
  const [newRouterTunName, setNewRouterTunName] = useState('');
  const [isCreatingRouter, setIsCreatingRouter] = useState(false);

  const onConnect = useCallback(
    async (params: Connection) => {
      if (!params.source || !params.target) {
        setLogs(prev => ['ERROR: Invalid connection parameters (source or target missing)', ...prev].slice(-100));
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/connections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ router1Id: params.source, router2Id: params.target }),
        });
        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Failed to create connection: ${response.statusText} - ${errorData}`);
        }
        const newConnection: ConnectionInfo = await response.json();
        // Add edge manually or rely on WebSocket + fetchAndSetConnections
        // setEdges((eds) => addEdge({ ...params, id: newConnection.id, animated: true }, eds));
        setLogs(prev => [`Connection ${newConnection.id} created via API for ${params.source} to ${params.target}`, ...prev].slice(-100));
        // WebSocket event should trigger update, or call fetchAndSetConnections()
      } catch (error) {
        console.error('Error creating connection:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        setLogs(prev => [`ERROR creating connection: ${errorMessage}`, ...prev].slice(-100));
      }
    },
    [setEdges] // If manually adding edge, add setEdges here
  );

  const [wsUrl, setWsUrl] = useState('');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWsUrl(`ws://${window.location.hostname}:8080/ws`);
    }
  }, []);

  // React Flowの型警告・再描画対策
  const nodeTypes = React.useMemo(() => ({}), []);
  const edgeTypes = React.useMemo(() => ({}), []);

  // Fetch routers from API and update React Flow nodes
  const fetchAndSetRouters = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/routers`);
      if (!response.ok) {
        throw new Error(`Failed to fetch routers: ${response.statusText}`);
      }
      const data: GoRouterInfo[] = await response.json();
      console.log('Routers from API:', data); // デバッグ用
      const newNodes: Node<CustomRouterNodeData>[] = data.map((router, index) => ({
        id: router.id,
        position: { x: 400, y: 300 + (index * 100) }, // 画面中央付近に縦並び
        data: {
          routerId: router.id,
          label: `${router.id} (${router.tunName || 'N/A'})`,
          ip: router.ip,
        },
        type: 'default',
      }));
      console.log('newNodes:', newNodes); // デバッグ用
      setNodes(() => newNodes); // コールバック形式を維持
      setLogs((prev) => ['Fetched routers from API', ...prev].slice(-100));
    } catch (error) {
      console.error('Error fetching routers:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setLogs((prev) => [`ERROR fetching routers: ${errorMessage}`, ...prev].slice(-100));
    }
  }, [setNodes]);

  const fetchAndSetConnections = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/connections`);
      if (!response.ok) {
        throw new Error(`Failed to fetch connections: ${response.statusText}`);
      }
      const data: ConnectionInfo[] = await response.json();
      const newEdges: Edge[] = data.map(conn => ({
        id: conn.id,
        source: conn.router1Id,
        target: conn.router2Id,
        // type: 'custom', // Optional: if using custom edge types
        animated: true, // Example: make edges animated
      }));
      setEdges(() => newEdges);
      setLogs(prev => ['Fetched connections from API', ...prev].slice(-100));
    } catch (error) {
      console.error('Error fetching connections:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setLogs(prev => [`ERROR fetching connections: ${errorMessage}`, ...prev].slice(-100));
    }
  }, [setEdges]);

  useEffect(() => {
    fetchAndSetRouters(); // Initial fetch for routers
    fetchAndSetConnections(); // Initial fetch for connections
  }, [fetchAndSetRouters, fetchAndSetConnections]);

  useEffect(() => {
    if (!wsUrl) return;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => setLogs((prev) => ['WebSocket connected', ...prev].slice(-100));
    ws.onmessage = (event) => {
      const message = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
      setLogs((prev) => [`RECV: ${message}`, ...prev].slice(-100));
      try {
        const parsed = JSON.parse(message);
        if (parsed.event === 'ROUTER_CREATED' || parsed.event === 'ROUTER_DELETED') {
          setLogs((prev) =>
            [`Event received: ${parsed.event}, fetching routers...`, ...prev].slice(-100)
          );
          fetchAndSetRouters();
        } else if (parsed.event === 'ROUTING_TABLE_UPDATED') {
          const { routerId, table } = parsed;
          if (typeof routerId === 'string' && Array.isArray(table)) {
            setRoutingTables((prevTables) => ({
              ...prevTables,
              [routerId]: table as RoutingEntry[],
            }));
            setLogs((prev) => [`Routing table updated for ${routerId}`, ...prev].slice(-100));
          } else {
            setLogs((prev) =>
              [
                `Received malformed ROUTING_TABLE_UPDATED: ${JSON.stringify(parsed)}`,
                ...prev,
              ].slice(-100)
            );
          }
        } else if (parsed.event === 'CONNECTION_CREATED') {
          setLogs(prev => [`Event received: CONNECTION_CREATED, fetching connections...`, ...prev].slice(-100));
          fetchAndSetConnections(); // Or add the new connection locally
        } else if (parsed.event === 'CONNECTION_DELETED') {
          setLogs(prev => [`Event received: CONNECTION_DELETED, fetching connections...`, ...prev].slice(-100));
          fetchAndSetConnections(); // Or remove the connection locally
        }
      } catch (_e) {
        // console.error("Error parsing ws message:", e); // Already logged in general RECV
      }
    };
    ws.onerror = (error) =>
      setLogs((prev) => [`ERROR: ${JSON.stringify(error)}`, ...prev].slice(-100));
    ws.onclose = () => setLogs((prev) => ['WebSocket disconnected', ...prev].slice(-100));
    return () => ws.close();
  }, [wsUrl, fetchAndSetRouters, fetchAndSetConnections]);

  const handleCreateRouter = async (e: FormEvent) => {
    e.preventDefault();
    setIsCreatingRouter(true);
    try {
      const response = await fetch(`${API_BASE_URL}/routers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newRouterId,
          ipCIDR: newRouterIpCIDR,
          tunName: newRouterTunName,
        }),
      });
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to create router: ${response.statusText} - ${errorData}`);
      }
      const createdRouter: GoRouterInfo = await response.json();
      setLogs((prev) =>
        [`Router ${createdRouter.id} created successfully via API`, ...prev].slice(-100)
      );
      setNewRouterId('');
      setNewRouterIpCIDR('');
      setNewRouterTunName('');
      fetchAndSetRouters();
      fetchAndSetConnections();
    } catch (error) {
      console.error('Error creating router:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setLogs((prev) => [`ERROR creating router: ${errorMessage}`, ...prev].slice(-100));
    } finally {
      setIsCreatingRouter(false);
    }
  };

  const handleDeleteRouter = async (nodeId: string) => {
    if (!nodeId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/routers/${nodeId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to delete router: ${response.statusText} - ${errorData}`);
      }
      setLogs((prev) => [`Router ${nodeId} delete request sent successfully`, ...prev].slice(-100));
      // WebSocket event should trigger fetchAndSetRouters
    } catch (error) {
      console.error('Error deleting router:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setLogs((prev) => [`ERROR deleting router ${nodeId}: ${errorMessage}`, ...prev].slice(-100));
    }
  };

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedRouterId(node.id);
    // Optionally, fetch routing table here if not relying solely on WebSocket updates
    // Or, if table for node.id is already in routingTables, it will be displayed
    setLogs((prev) => [`Node ${node.id} clicked. Displaying its details.`, ...prev].slice(-100));
  }, []);

  return (
    <div className="flex flex-col h-screen bg-slate-800 text-slate-100">
      <header className="p-4 shadow-md bg-slate-900">
        <h1 className="text-2xl font-bold text-sky-400">Day44 - Go Virtual Router Control Panel</h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content area with topology and controls */}
        <main className="flex-1 flex flex-col p-4 gap-4">
          {/* Router Creation Form */}
          <form onSubmit={handleCreateRouter} className="p-6 rounded-xl shadow-neu-button bg-slate-800 space-y-4">
            <h2 className="text-xl font-semibold text-sky-300 mb-3">Create New Router</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="newRouterId" className="block text-sm font-medium text-slate-400 mb-1">Router ID (Optional)</label>
                <input
                  type="text"
                  id="newRouterId"
                  value={newRouterId}
                  onChange={(e) => setNewRouterId(e.target.value)}
                  placeholder="e.g., router-a"
                  className="input-neu"
                />
              </div>
              <div>
                <label htmlFor="newRouterIpCIDR" className="block text-sm font-medium text-slate-400 mb-1">IP Address/CIDR (Optional)</label>
                <input
                  type="text"
                  id="newRouterIpCIDR"
                  value={newRouterIpCIDR}
                  onChange={(e) => setNewRouterIpCIDR(e.target.value)}
                  placeholder="e.g., 10.0.1.1/24"
                  className="input-neu"
                />
              </div>
              <div>
                <label htmlFor="newRouterTunName" className="block text-sm font-medium text-slate-400 mb-1">TUN Name (Optional)</label>
                <input
                  type="text"
                  id="newRouterTunName"
                  value={newRouterTunName}
                  onChange={(e) => setNewRouterTunName(e.target.value)}
                  placeholder="e.g., tun0"
                  className="input-neu"
                />
              </div>
            </div>
            <button
              type="submit"
              className="btn-neu w-full md:w-auto"
              disabled={isCreatingRouter}
            >
              {isCreatingRouter ? 'Creating...' : 'Create Router'}
            </button>
          </form>

          {/* Network Topology Area */}
          <div className="flex-1 rounded-xl shadow-neu-inset-soft bg-slate-800" style={{ minHeight: '400px' }}>
            <div className="neumorphism-parent flex-grow min-h-[300px]">
              <h2 className="text-xl font-semibold text-sky-300 mb-3 p-1">Network Topology</h2>
              <div className="neumorphism-inset h-[calc(100%-50px)] p-1" style={{ height: '500px', width: '100%' }}>
                <ReactFlow
                  style={{ width: '100%', height: '100%' }}
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  fitView
                  attributionPosition="top-right"
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  deleteKeyCode={['Backspace', 'Delete']}
                  onNodesDelete={(deletedNodes) => {
                    for (const node of deletedNodes) {
                      handleDeleteRouter(node.id);
                    }
                  }}
                  onEdgesDelete={async (deletedEdges) => {
                    for (const edge of deletedEdges) {
                      try {
                        const response = await fetch(`${API_BASE_URL}/connections/${edge.id}`, {
                          method: 'DELETE',
                        });
                        if (!response.ok) {
                          const errorData = await response.text();
                          throw new Error(`Failed to delete connection: ${response.statusText} - ${errorData}`);
                        }
                        setLogs(prev => [`Connection ${edge.id} delete request sent successfully`, ...prev].slice(-100));
                        // WebSocket event should trigger fetchAndSetConnections
                      } catch (error) {
                        console.error('Error deleting connection:', error);
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        setLogs(prev => [`ERROR deleting connection ${edge.id}: ${errorMessage}`, ...prev].slice(-100));
                      }
                    }
                  }}
                  onNodeClick={onNodeClick}
                >
                  <MiniMap nodeStrokeWidth={3} zoomable pannable />
                  <Controls />
                  <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                </ReactFlow>
              </div>
            </div>
            <div className="neumorphism-parent md:h-2/5">
              <h2 className="text-xl font-semibold text-sky-300 mb-3 p-1">Router Controls / Details</h2>
              <div className="neumorphism-inset p-4 overflow-y-auto h-[calc(100%-50px)]">
                {selectedRouterId && (
                  <div className="mt-6 pt-4 border-t border-slate-700">
                    <h3 className="text-lg font-medium text-sky-200 mb-2">
                      Routing Table for {selectedRouterId}
                    </h3>
                    {routingTables[selectedRouterId] && routingTables[selectedRouterId].length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-left text-slate-400">
                          <thead className="text-xs text-sky-300 uppercase bg-slate-700/30">
                            <tr>
                              <th scope="col" className="px-3 py-2">
                                Network
                              </th>
                              <th scope="col" className="px-3 py-2">
                                Next Hop
                              </th>
                              <th scope="col" className="px-3 py-2">
                                Next Hop ID
                              </th>
                              <th scope="col" className="px-3 py-2">
                                Iface
                              </th>
                              <th scope="col" className="px-3 py-2">
                                Metric
                              </th>
                              <th scope="col" className="px-3 py-2">
                                From
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {routingTables[selectedRouterId].map((entry, idx) => (
                              <tr
                                key={`${selectedRouterId}-route-${idx}`}
                                className="border-b border-slate-700 hover:bg-slate-700/50"
                              >
                                <td className="px-3 py-2">{entry.Network}</td>
                                <td className="px-3 py-2">{entry.NextHop}</td>
                                <td className="px-3 py-2">{entry.NextHopRouterID}</td>
                                <td className="px-3 py-2">{entry.Interface}</td>
                                <td className="px-3 py-2">{entry.Metric}</td>
                                <td className="px-3 py-2">{entry.LearnedFrom}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-slate-500">
                        No routing table data available for {selectedRouterId} or table is empty.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* Event Logs */}
        <div className="md:w-1/3 neumorphism-parent">
          <h2 className="text-xl font-semibold text-sky-300 mb-3 p-1">Event Logs</h2>
          <div className="neumorphism-inset p-3 overflow-y-auto h-[calc(100%-50px)] text-xs">
            {logs.length === 0 && <p className="text-slate-500">No logs yet...</p>}
            <ul className="space-y-1">
              {logs.map((log, index) => (
                <li
                  key={index}
                  className={`whitespace-pre-wrap break-all ${log.startsWith('ERROR:') ? 'text-red-400' : log.startsWith('WebSocket connected') || log.startsWith('WebSocket disconnected') ? 'text-amber-300' : log.startsWith('Fetched') || log.startsWith('Event') || log.startsWith('Routing table') ? 'text-cyan-400' : 'text-slate-400'}`}
                >
                  {log}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
