"use client"; // APIをクライアントサイドでフェッチするため

import { useEffect, useState, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  Connection,
  NodeChange,
  EdgeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  fetchTopology,
  TopologyData,
  RouterInfo as ApiRouterInfo,
  LinkInfo as ApiLinkInfo,
  addRouter as apiAddRouter,
  deleteRouter as apiDeleteRouter,
  addLink as apiAddLink,
  deleteLink as apiDeleteLink,
  pingRouter as apiPingRouter,
  PingResult,
  fetchRouterDetail,
  RouterDetailData,
} from '../lib/api'; // Changed import path from '@/lib/api' to '../lib/api'

// Extend Node data type for our specific router info
interface RouterNodeData extends ApiRouterInfo {
  label: string;
}

// Type for our custom router node
type RouterNode = Node<RouterNodeData>;

export default function HomePage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<RouterNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedRouter, setSelectedRouter] = useState<RouterDetailData | null>(null);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);

  // Form states - to be implemented further
  const [newRouterId, setNewRouterId] = useState('');
  const [newRouterIpCidr, setNewRouterIpCidr] = useState('');
  const [newRouterMtu, setNewRouterMtu] = useState<number | string>(''); // MTU can be empty or number
  const [newLinkSource, setNewLinkSource] = useState('');
  const [newLinkTarget, setNewLinkTarget] = useState('');
  const [newLinkCost, setNewLinkCost] = useState(10);
  const [newLinkSourceIp, setNewLinkSourceIp] = useState('');
  const [newLinkTargetIp, setNewLinkTargetIp] = useState('');
  const [pingTargetIp, setPingTargetIp] = useState('');

  const displayMessage = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      setSuccessMessage(message);
      setError(null);
    } else {
      setError(message);
      setSuccessMessage(null);
    }
    setTimeout(() => {
      setSuccessMessage(null);
      setError(null);
    }, 5000); // Clear message after 5 seconds
  };

  const loadTopology = useCallback(async () => {
    try {
      // setError(null); // Keep existing error if any, until explicit clear
      const topology = await fetchTopology();
      console.log("Fetched topology:", topology);

      const routerNodes: RouterNode[] = topology.routers.map((router, index) => ({
        id: router.id,
        type: 'default',
        data: { ...router, label: `${router.id} (${router.ip})` },
        position: { x: (index % 4) * 220, y: Math.floor(index / 4) * 150 }, // Adjusted layout
      }));

      const linkEdges: Edge[] = topology.links.map(link => ({
        id: `e-${link.source}-${link.target}`,
        source: link.source,
        target: link.target,
        label: `Cost: ${link.cost}`,
        animated: true,
      }));

      setNodes(routerNodes);
      setEdges(linkEdges);
    } catch (err: any) {
      console.error("Failed to load topology:", err);
      displayMessage('error', err.message || 'Failed to load topology');
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    loadTopology();
  }, [loadTopology]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  const handleNodeClick = useCallback(async (event: React.MouseEvent, node: RouterNode) => {
    console.log('Node clicked:', node);
    try {
      displayMessage('success', ''); // Clear previous messages
      setPingResult(null);
      const detail = await fetchRouterDetail(node.id);
      setSelectedRouter(detail);
    } catch (err: any) {
      console.error(`Failed to fetch details for router ${node.id}:`, err);
      displayMessage('error', err.message || `Failed to fetch details for router ${node.id}`);
      setSelectedRouter(null);
    }
  }, []);

  const handleAddRouter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRouterId || !newRouterIpCidr) {
      displayMessage('error', 'Router ID and IP CIDR are required.');
      return;
    }
    try {
      const mtu = newRouterMtu === '' ? undefined : Number(newRouterMtu);
      if (newRouterMtu !== '' && (isNaN(mtu as number) || (mtu as number) <= 0)) {
        displayMessage('error', 'Invalid MTU value.');
        return;
      }
      await apiAddRouter(newRouterId, newRouterIpCidr, mtu);
      displayMessage('success', `Router ${newRouterId} added successfully.`);
      setNewRouterId('');
      setNewRouterIpCidr('');
      setNewRouterMtu('');
      loadTopology();
    } catch (err: any) {
      displayMessage('error', err.message || `Failed to add router ${newRouterId}.`);
    }
  };

  const handleDeleteRouter = async (routerId: string | undefined) => {
    if (!routerId) return;
    if (!window.confirm(`Are you sure you want to delete router ${routerId}?`)) return;
    try {
      await apiDeleteRouter(routerId);
      displayMessage('success', `Router ${routerId} deleted successfully.`);
      setSelectedRouter(null); // Clear selection
      loadTopology();
    } catch (err: any) {
      displayMessage('error', err.message || `Failed to delete router ${routerId}.`);
    }
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkSource || !newLinkTarget || !newLinkSourceIp || !newLinkTargetIp) {
      displayMessage('error', 'Source ID, Target ID, Source IP, and Target IP are required for adding a link.');
      return;
    }
    if (isNaN(Number(newLinkCost)) || Number(newLinkCost) <= 0) {
      displayMessage('error', 'Invalid cost value. Must be a positive number.');
      return;
    }
    try {
      await apiAddLink(
        newLinkSource,
        newLinkTarget,
        newLinkSourceIp,
        newLinkTargetIp,
        Number(newLinkCost)
      );
      displayMessage('success', `Link between ${newLinkSource} and ${newLinkTarget} added successfully.`);
      setNewLinkSource('');
      setNewLinkTarget('');
      setNewLinkCost(10);
      setNewLinkSourceIp('');
      setNewLinkTargetIp('');
      loadTopology();
    } catch (err: any) {
      displayMessage('error', err.message || `Failed to add link between ${newLinkSource} and ${newLinkTarget}.`);
    }
  };

  const handleDeleteLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkSource || !newLinkTarget) {
      displayMessage('error', 'Source Router ID and Target Router ID are required for deleting a link.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete the link between ${newLinkSource} and ${newLinkTarget}?`)) return;

    try {
      await apiDeleteLink(newLinkSource, newLinkTarget);
      displayMessage('success', `Link between ${newLinkSource} and ${newLinkTarget} deleted successfully.`);
      // Clear only link form fields after successful deletion, keep router form fields if they were filled
      setNewLinkSource('');
      setNewLinkTarget('');
      // Optionally reset cost, source IP, target IP if they are part of a combined form, but here they are separate for add/delete logic
      loadTopology();
    } catch (err: any) {
      displayMessage('error', err.message || `Failed to delete link between ${newLinkSource} and ${newLinkTarget}.`);
    }
  };

  const handlePing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouter || !selectedRouter.id) {
      displayMessage('error', 'Please select a source router from the graph first.');
      return;
    }
    if (!pingTargetIp) {
      displayMessage('error', 'Target IP address is required for ping.');
      return;
    }
    try {
      setPingResult(null); // Clear previous ping result
      const result = await apiPingRouter(selectedRouter.id, pingTargetIp);
      setPingResult(result);
      if (result.success) {
        displayMessage('success', `Ping to ${pingTargetIp} from ${selectedRouter.id} successful. Hops: ${result.path?.join(' -> ') || 'N/A'}`);
      } else {
        displayMessage('error', result.error || `Ping to ${pingTargetIp} from ${selectedRouter.id} failed.`);
      }
      setPingTargetIp(''); // Clear target IP input after ping
    } catch (err: any) {
      setPingResult({
        success: false,
        message: err.message || `Failed to execute ping from ${selectedRouter.id} to ${pingTargetIp}.`,
        sourceRouterId: selectedRouter.id,
        targetIp: pingTargetIp,
        path: [],
        error: err.message || 'Unknown error'
      });
      displayMessage('error', err.message || `Failed to execute ping from ${selectedRouter.id} to ${pingTargetIp}.`);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Left Panel: React Flow Graph */}
      <div className="flex-grow h-full relative" style={{ height: '100vh' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange as (changes: NodeChange[]) => void} // Added type assertion
          onEdgesChange={onEdgesChange as (changes: EdgeChange[]) => void} // Added type assertion
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          fitView
          className="bg-gray-800"
        >
          <Controls />
          <MiniMap />
          <Background gap={16} color="#4A5568" />
        </ReactFlow>
        {(error || successMessage) && (
          <div
            className={`absolute top-2 left-2 text-white p-3 rounded shadow-lg z-10 ${error ? 'bg-red-700' : 'bg-green-600'}`}
          >
            {error || successMessage}
          </div>
        )}
      </div>

      {/* Right Panel: Controls and Info */}
      <div className="w-96 h-full bg-gray-800 p-4 overflow-y-auto shadow-xl flex flex-col space-y-6">
        <h1 className="text-3xl font-bold mb-4 text-center text-blue-400">Router Control</h1>

        <form onSubmit={handleAddRouter} className="p-4 bg-gray-700 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-3 text-blue-300">Add Router</h2>
          <div className="mb-3">
            <label htmlFor="routerId" className="block text-sm font-medium text-gray-300 mb-1">Router ID</label>
            <input
              type="text" id="routerId" value={newRouterId} onChange={(e) => setNewRouterId(e.target.value)}
              className="w-full p-2 bg-gray-600 border border-gray-500 rounded focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., R3"
            />
          </div>
          <div className="mb-3">
            <label htmlFor="ipCidr" className="block text-sm font-medium text-gray-300 mb-1">IP CIDR</label>
            <input
              type="text" id="ipCidr" value={newRouterIpCidr} onChange={(e) => setNewRouterIpCidr(e.target.value)}
              className="w-full p-2 bg-gray-600 border border-gray-500 rounded focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., 10.0.3.1/24"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="mtu" className="block text-sm font-medium text-gray-300 mb-1">MTU (Optional)</label>
            <input
              type="number" id="mtu" value={newRouterMtu} onChange={(e) => setNewRouterMtu(e.target.value)}
              className="w-full p-2 bg-gray-600 border border-gray-500 rounded focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., 1500 (default)"
            />
          </div>
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition duration-150 ease-in-out">
            Add Router
          </button>
        </form>

        {/* Add Link Form */}
        <form onSubmit={handleAddLink} className="p-4 bg-white/10 backdrop-blur-md rounded-lg shadow-xl border border-gray-700">
          <h2 className="text-xl font-semibold mb-3 text-sky-300">Add Link</h2>
          <div className="mb-3">
            <label htmlFor="linkSource" className="block text-sm font-medium text-gray-300 mb-1">Source Router ID</label>
            <input
              id="linkSource"
              type="text"
              value={newLinkSource}
              onChange={(e) => setNewLinkSource(e.target.value)}
              placeholder="e.g., router1"
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 text-white placeholder-gray-400"
            />
          </div>
          <div className="mb-3">
            <label htmlFor="linkTarget" className="block text-sm font-medium text-gray-300 mb-1">Target Router ID</label>
            <input
              id="linkTarget"
              type="text"
              value={newLinkTarget}
              onChange={(e) => setNewLinkTarget(e.target.value)}
              placeholder="e.g., router2"
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 text-white placeholder-gray-400"
            />
          </div>
          <div className="mb-3">
            <label htmlFor="linkCost" className="block text-sm font-medium text-gray-300 mb-1">Cost</label>
            <input
              id="linkCost"
              type="number"
              value={newLinkCost}
              onChange={(e) => setNewLinkCost(Number(e.target.value))}
              min="1"
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 text-white placeholder-gray-400"
            />
          </div>
          <div className="mb-3">
            <label htmlFor="linkSourceIp" className="block text-sm font-medium text-gray-300 mb-1">Source Router Interface IP (CIDR)</label>
            <input
              id="linkSourceIp"
              type="text"
              value={newLinkSourceIp}
              onChange={(e) => setNewLinkSourceIp(e.target.value)}
              placeholder="e.g., 10.0.1.1/24"
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 text-white placeholder-gray-400"
            />
          </div>
          <div className="mb-3">
            <label htmlFor="linkTargetIp" className="block text-sm font-medium text-gray-300 mb-1">Target Router Interface IP (CIDR)</label>
            <input
              id="linkTargetIp"
              type="text"
              value={newLinkTargetIp}
              onChange={(e) => setNewLinkTargetIp(e.target.value)}
              placeholder="e.g., 10.0.1.2/24"
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 text-white placeholder-gray-400"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-4 rounded-md shadow-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50 transition duration-150"
          >
            Add Link
          </button>
        </form>

        {/* Delete Link Form */}
        <form onSubmit={handleDeleteLink} className="p-4 bg-white/10 backdrop-blur-md rounded-lg shadow-xl border border-gray-700 mt-6">
          <h2 className="text-xl font-semibold mb-3 text-red-400">Delete Link</h2>
          <div className="mb-3">
            <label htmlFor="deleteLinkSource" className="block text-sm font-medium text-gray-300 mb-1">Source Router ID</label>
            <input
              id="deleteLinkSource"
              type="text"
              value={newLinkSource} // Re-using state for simplicity, consider separate if complex
              onChange={(e) => setNewLinkSource(e.target.value)}
              placeholder="e.g., router1"
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 text-white placeholder-gray-400"
            />
          </div>
          <div className="mb-3">
            <label htmlFor="deleteLinkTarget" className="block text-sm font-medium text-gray-300 mb-1">Target Router ID</label>
            <input
              id="deleteLinkTarget"
              type="text"
              value={newLinkTarget} // Re-using state for simplicity, consider separate if complex
              onChange={(e) => setNewLinkTarget(e.target.value)}
              placeholder="e.g., router2"
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 text-white placeholder-gray-400"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-md shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition duration-150"
          >
            Delete Link
          </button>
        </form>

        {/* Ping Form */}
        <form onSubmit={handlePing} className="p-4 bg-white/10 backdrop-blur-md rounded-lg shadow-xl border border-gray-700 mt-6">
          <h2 className="text-xl font-semibold mb-3 text-green-400">Ping Router</h2>
          <div className="mb-3">
            <label htmlFor="pingSourceRouter" className="block text-sm font-medium text-gray-300 mb-1">Source Router</label>
            <input
              id="pingSourceRouter"
              type="text"
              value={selectedRouter ? `${selectedRouter.id} (${selectedRouter.ipAddress})` : 'Select a router from graph'}
              readOnly
              className="w-full p-2 bg-gray-600 border border-gray-500 rounded-md shadow-sm text-gray-300 placeholder-gray-400 cursor-not-allowed"
            />
          </div>
          <div className="mb-3">
            <label htmlFor="pingTargetIp" className="block text-sm font-medium text-gray-300 mb-1">Target IP Address</label>
            <input
              id="pingTargetIp"
              type="text"
              value={pingTargetIp}
              onChange={(e) => setPingTargetIp(e.target.value)}
              placeholder="e.g., 172.16.2.1"
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 text-white placeholder-gray-400"
            />
          </div>
          <button
            type="submit"
            disabled={!selectedRouter}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition duration-150 disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            Ping
          </button>
        </form>

        {/* Ping Result Display */}
        {pingResult && (
          <div className="mt-6 p-4 bg-gray-700 rounded-lg shadow-lg">
            <h3 className={`text-lg font-semibold mb-2 ${pingResult.success ? 'text-green-400' : 'text-red-400'}`}>
              Ping Result: {pingResult.success ? 'Success' : 'Failed'}
            </h3>
            <p className="text-sm text-gray-300">
              <strong>From:</strong> {pingResult.sourceRouterId}<br />
              <strong>To:</strong> {pingResult.targetIp}<br />
              {pingResult.success && pingResult.path && pingResult.path.length > 0 && (
                <>
                  <strong>Path:</strong> {pingResult.path.join(' → ')}<br />
                </>
              )}
              {pingResult.message && (
                 <><strong>Message:</strong> {pingResult.message}</>
              )}
              {!pingResult.success && pingResult.error && (
                <><strong>Error:</strong> {pingResult.error}</>
              )}
            </p>
          </div>
        )}

        {/* Selected Router Info - to be improved */}
        {selectedRouter && (
          <div className="mt-6 p-6 bg-gray-700 rounded-lg shadow-xl border border-gray-600">
            <h2 className="text-2xl font-bold mb-4 text-purple-300">Router: {selectedRouter.id}</h2>
            <div className="space-y-2 text-sm">
              <p><strong className="text-purple-200">IP Address:</strong> {selectedRouter.ipAddress}</p>
              <p><strong className="text-purple-200">Gateway:</strong> {selectedRouter.gateway || 'N/A'}</p>
              <p><strong className="text-purple-200">MTU:</strong> {selectedRouter.mtu}</p>
              <p><strong className="text-purple-200">Running:</strong> {selectedRouter.isRunning ? 'Yes' : 'No'}</p>

              <h3 className="text-lg font-semibold pt-3 mt-3 border-t border-gray-600 text-purple-200">Routing Table:</h3>
              {selectedRouter.routingTable && selectedRouter.routingTable.length > 0 ? (
                <ul className="list-disc list-inside pl-4 space-y-1 max-h-40 overflow-y-auto bg-gray-800 p-2 rounded-md">
                  {selectedRouter.routingTable.map((entry, index) => (
                    <li key={index} className="text-xs">
                      <span className="font-mono">{entry.destinationCidr}</span> via <span className="font-mono">{entry.nextHop || 'Direct'}</span> (Cost: {entry.cost}, Interface: {entry.interfaceName})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400 italic">No routes</p>
              )}

              <h3 className="text-lg font-semibold pt-3 mt-3 border-t border-gray-600 text-purple-200">LSDB:</h3>
              {selectedRouter.lsdb && selectedRouter.lsdb.length > 0 ? (
                <ul className="list-disc list-inside pl-4 space-y-1 max-h-40 overflow-y-auto bg-gray-800 p-2 rounded-md">
                  {selectedRouter.lsdb.map((lsa, index) => (
                    <li key={index} className="text-xs">
                       <span className="font-mono">LSA from {lsa.routerId} (Seq: {lsa.sequenceNumber}):</span>
                       <ul className="list-disc list-inside pl-6">
                        {lsa.links?.map(link =>
                          <li key={`${link.neighborId}-${link.subnetCidr}`} className="font-mono">
                            {link.neighborId} on {link.subnetCidr} (Cost: {link.cost})
                          </li>
                        )}
                       </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400 italic">LSDB empty or not available</p>
              )}

              <button
                onClick={() => handleDeleteRouter(selectedRouter.id)}
                className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-3 rounded-md shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition duration-150"
              >
                Delete Router {selectedRouter.id}
              </button>
            </div>
          </div>
        )}

        {!selectedRouter && (
           <p className="text-center text-gray-400 mt-6">Click on a router node to see details and perform actions.</p>
        )}
      </div>
    </div>
  );
}
