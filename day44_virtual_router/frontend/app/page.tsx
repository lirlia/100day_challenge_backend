"use client"; // APIをクライアントサイドでフェッチするため

import { useEffect, useState } from "react";

interface RouterInfo {
  id: string;
  ip: string;
  status: boolean;
  ospf_enabled: boolean;
}

interface LinkInfo {
  source: string;
  target: string;
  cost: number;
  local_ip: string;
  remote_ip: string;
}

interface TopologyData {
  routers: RouterInfo[];
  links: LinkInfo[];
}

export default function HomePage() {
  const [topology, setTopology] = useState<TopologyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTopology() {
      try {
        const response = await fetch("http://localhost:8080/api/topology");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: TopologyData = await response.json();
        console.log("Fetched topology data:", data);
        setTopology(data);
      } catch (e: any) {
        console.error("Failed to fetch topology:", e);
        setError(e.message || "Failed to load topology data.");
      }
    }

    fetchTopology();
  }, []);

  if (error) {
    return <div className="text-red-500 p-4">Error loading topology: {error}</div>;
  }

  if (!topology) {
    return <div className="p-4">Loading topology...</div>;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-8 bg-gray-50">
      <h1 className="text-4xl font-bold mb-8 text-gray-800">Virtual Router Network Topology</h1>

      <div className="w-full max-w-4xl">
        <section className="mb-12 p-6 bg-white shadow-lg rounded-lg">
          <h2 className="text-2xl font-semibold mb-4 text-gray-700">Routers</h2>
          {topology.routers.length > 0 ? (
            <ul className="list-disc pl-5 space-y-2">
              {topology.routers.map((router) => (
                <li key={router.id} className="text-gray-600">
                  <span className="font-medium text-gray-800">{router.id}</span> ({router.ip}) -
                  Status: {router.status ? <span className="text-green-600">Running</span> : <span className="text-red-600">Stopped</span>} -
                  OSPF: {router.ospf_enabled ? <span className="text-blue-600">Enabled</span> : <span className="text-gray-500">Disabled</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No routers found.</p>
          )}
        </section>

        <section className="p-6 bg-white shadow-lg rounded-lg">
          <h2 className="text-2xl font-semibold mb-4 text-gray-700">Links</h2>
          {topology.links.length > 0 ? (
            <ul className="list-disc pl-5 space-y-2">
              {topology.links.map((link, index) => (
                <li key={`${link.source}-${link.target}-${index}`} className="text-gray-600">
                  <span className="font-medium text-gray-800">{link.source} &lt;--&gt; {link.target}</span> (Cost: {link.cost})
                  <br />
                  <span className="text-sm text-gray-500">
                    {link.source} IP: {link.local_ip} | {link.target} IP: {link.remote_ip}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No links found.</p>
          )}
        </section>
      </div>
    </main>
  );
}
