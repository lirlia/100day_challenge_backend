'use client';

import React, { useState, useCallback, useEffect, FormEvent } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  Connection,
  BackgroundVariant,
  Position,
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
  label: string;    // Label for display, e.g., "router-A (tun0)"
  ip: string;
  // type?: 'custom' // Node自体がtypeを持つので、dataの中にtypeは不要なことが多い
}

type AppNode = Node<CustomRouterNodeData>;

// API base URL
const API_BASE_URL = 'http://localhost:8080/api';

export default function HomePage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [logs, setLogs] = useState<string[]>([]);

  // Form state for creating a router
  const [newRouterId, setNewRouterId] = useState('');
  const [newRouterIpCIDR, setNewRouterIpCIDR] = useState('');
  const [newRouterTunName, setNewRouterTunName] = useState('');

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const [wsUrl, setWsUrl] = useState('');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWsUrl(`ws://${window.location.hostname}:8080/ws`);
    }
  }, []);

  // Fetch routers from API and update React Flow nodes
  const fetchAndSetRouters = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/routers`);
      if (!response.ok) {
        throw new Error(`Failed to fetch routers: ${response.statusText}`);
      }
      const data: GoRouterInfo[] = await response.json();
      const newNodes: AppNode[] = data.map((router, index) => ({
        id: router.id,
        position: { x: (index % 5) * 150 + 50, y: Math.floor(index / 5) * 120 + 50 },
        data: { // This is CustomRouterNodeData
          routerId: router.id,
          label: `${router.id} (${router.tunName || 'N/A'})`,
          ip: router.ip,
        },
        // type: 'customRouterNode' // 必要であればノードタイプを指定
      }));
      setNodes(() => newNodes); // コールバック形式を維持
      setLogs(prev => ['Fetched routers from API', ...prev].slice(-100));
    } catch (error) {
      console.error("Error fetching routers:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setLogs(prev => [`ERROR fetching routers: ${errorMessage}`, ...prev].slice(-100));
    }
  }, [setNodes]);

  useEffect(() => {
    fetchAndSetRouters(); // Initial fetch
  }, [fetchAndSetRouters]);

  useEffect(() => {
    if (!wsUrl) return;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => setLogs(prev => ['WebSocket connected', ...prev].slice(-100));
    ws.onmessage = (event) => {
      const message = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
      setLogs(prev => [`RECV: ${message}`, ...prev].slice(-100));
      try {
        const parsed = JSON.parse(message);
        if (parsed.event === 'ROUTER_CREATED' || parsed.event === 'ROUTER_DELETED') {
          setLogs(prev => [`Event received: ${parsed.event}, fetching routers...`, ...prev].slice(-100));
          fetchAndSetRouters();
        }
        // TODO: Handle other events like TOPOLOGY_UPDATE for edges
      } catch (e) {
        // console.error("Error parsing ws message:", e); // Already logged in general RECV
      }
    };
    ws.onerror = (error) => setLogs(prev => [`ERROR: ${JSON.stringify(error)}`, ...prev].slice(-100));
    ws.onclose = () => setLogs(prev => ['WebSocket disconnected', ...prev].slice(-100));
    return () => ws.close();
  }, [wsUrl, fetchAndSetRouters]);

  const handleCreateRouter = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRouterId || !newRouterIpCIDR) {
      setLogs(prev => ['ERROR: Router ID and IP CIDR are required for creation', ...prev].slice(-100));
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/routers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newRouterId,
          ipCIDR: newRouterIpCIDR,
          tunName: newRouterTunName, // MTU can be added if needed
        }),
      });
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to create router: ${response.statusText} - ${errorData}`);
      }
      const createdRouter = await response.json(); // Assuming backend returns created router info
      setLogs(prev => [`Router ${createdRouter.id} created successfully via API`, ...prev].slice(-100));
      // WebSocket event should trigger fetchAndSetRouters, or call it manually here as a fallback
      // fetchAndSetRouters();
      setNewRouterId('');
      setNewRouterIpCIDR('');
      setNewRouterTunName('');
    } catch (error) {
      console.error("Error creating router:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setLogs(prev => [`ERROR creating router: ${errorMessage}`, ...prev].slice(-100));
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
        setLogs(prev => [`Router ${nodeId} delete request sent successfully`, ...prev].slice(-100));
        // WebSocket event should trigger fetchAndSetRouters
    } catch (error) {
        console.error("Error deleting router:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        setLogs(prev => [`ERROR deleting router ${nodeId}: ${errorMessage}`, ...prev].slice(-100));
    }
  };

  // TODO: Add a way to select a node and call handleDeleteRouter
  // Example: onNodeClick = (event, node) => setSelectedNode(node);
  // Then have a delete button that calls handleDeleteRouter(selectedNode.id)

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-120px)]">
      <div className="md:w-2/3 flex flex-col gap-4">
        <div className="neumorphism-parent flex-grow min-h-[300px]">
          <h2 className="text-xl font-semibold text-sky-300 mb-3 p-1">Network Topology</h2>
          <div className="neumorphism-inset h-[calc(100%-50px)] p-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              fitView
              attributionPosition="top-right"
              nodeTypes={{ /* TODO: Add custom node types if needed */ }}
              edgeTypes={{ /* TODO: Add custom edge types if needed */ }}
              deleteKeyCode={['Backspace', 'Delete']}
              onNodesDelete={(deletedNodes) => {
                deletedNodes.forEach(node => handleDeleteRouter(node.id));
              }}
            >
              <MiniMap nodeStrokeWidth={3} zoomable pannable />
              <Controls />
              <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
            </ReactFlow>
          </div>
        </div>
        <div className="neumorphism-parent md:h-2/5">
          <h2 className="text-xl font-semibold text-sky-300 mb-3 p-1">Router Controls / Details</h2>
          <div className="neumorphism-inset p-4 h-[calc(100%-50px)] overflow-y-auto">
            <p className="text-slate-400 mb-4">Create a new router. Select a router on the graph and press Delete/Backspace to remove it.</p>
            <form onSubmit={handleCreateRouter} className="space-y-4">
              <div>
                <label htmlFor="routerId" className="block text-sm font-medium text-slate-300 mb-1">Router ID *</label>
                <input type="text" name="routerId" id="routerId" className="input-neumorphism" placeholder="e.g., router-A" value={newRouterId} onChange={(e) => setNewRouterId(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="ipCidr" className="block text-sm font-medium text-slate-300 mb-1">IP CIDR *</label>
                <input type="text" name="ipCidr" id="ipCidr" className="input-neumorphism" placeholder="e.g., 10.0.1.1/24" value={newRouterIpCIDR} onChange={(e) => setNewRouterIpCIDR(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="tunName" className="block text-sm font-medium text-slate-300 mb-1">TUN Name (Optional)</label>
                <input type="text" name="tunName" id="tunName" className="input-neumorphism" placeholder="e.g., tun0 (auto if empty)" value={newRouterTunName} onChange={(e) => setNewRouterTunName(e.target.value)} />
              </div>
              <button type="submit" className="btn-neumorphism w-full">
                Create Router
              </button>
            </form>
          </div>
        </div>
      </div>
      <div className="md:w-1/3 neumorphism-parent">
        <h2 className="text-xl font-semibold text-sky-300 mb-3 p-1">Event Logs</h2>
        <div className="neumorphism-inset p-3 h-[calc(100%-50px)] overflow-y-auto text-xs">
          {logs.length === 0 && <p className="text-slate-500">No logs yet...</p>}
          <ul className="space-y-1">
            {logs.map((log, index) => (
              <li key={index} className={`whitespace-pre-wrap break-all ${log.startsWith('ERROR:') ? 'text-red-400' : log.startsWith('WebSocket connected') || log.startsWith('WebSocket disconnected') ? 'text-amber-300' : log.startsWith('Fetched') || log.startsWith('Event') ? 'text-cyan-400' : 'text-slate-400'}`}>
                {log}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
