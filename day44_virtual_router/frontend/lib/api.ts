const API_BASE_URL = 'http://localhost:8080/api';

export interface RouterInfo {
  id: string;
  ip: string;
  status: boolean;
  ospf_enabled: boolean;
  // OSPF Neighbors and LSDB might be part of a detailed view
}

export interface LinkInfo {
  source: string; // Source Router ID
  target: string; // Target Router ID
  cost: number;
  source_ip: string;
  target_ip: string;
}

export interface TopologyData {
  routers: RouterInfo[];
  links: LinkInfo[];
}

export interface RoutingTableEntry {
  destinationCidr: string;
  nextHop: string;
  cost: number;
  interfaceName: string;
}

export interface LsaLinkInfo {
  neighborId: string;
  subnetCidr: string;
  cost: number;
}

export interface LsaInfo {
  routerId: string;
  sequenceNumber: number;
  links: LsaLinkInfo[];
}

export interface RouterDetailData {
  id: string;
  ipAddress: string;
  gateway: string;
  mtu: number;
  isRunning: boolean;
  routingTable: RoutingTableEntry[];
  lsdb: LsaInfo[];
}

export interface PingResult {
  success: boolean;
  message?: string;
  sourceRouterId?: string;
  targetIp?: string;
  path?: string[];
  rttMs?: number;
  error?: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
  }
  if (response.status === 204) { // No Content
    return null as T; // Or handle as needed, maybe an empty object or specific success type
  }
  return response.json();
}

export async function fetchTopology(): Promise<TopologyData> {
  const response = await fetch(`${API_BASE_URL}/topology`);
  return handleResponse<TopologyData>(response);
}

export async function fetchRouterDetail(routerId: string): Promise<RouterDetailData> {
  const response = await fetch(`${API_BASE_URL}/router/${routerId}`);
  return handleResponse<RouterDetailData>(response);
}

export async function addRouter(id: string, ipCidr: string, mtu?: number): Promise<RouterInfo> {
  const response = await fetch(`${API_BASE_URL}/router`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, ip_cidr: ipCidr, mtu }),
  });
  return handleResponse<RouterInfo>(response);
}

export async function deleteRouter(routerId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/router/${routerId}`, {
    method: 'DELETE',
  });
  await handleResponse<null>(response); // Expects 204 No Content
}

export async function addLink(
  sourceRouterId: string,
  targetRouterId: string,
  sourceRouterIp: string,
  targetRouterIp: string,
  cost: number
): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_router_id: sourceRouterId,
      target_router_id: targetRouterId,
      source_router_ip: sourceRouterIp,
      target_router_ip: targetRouterIp,
      cost,
    }),
  });
  return handleResponse<{ message: string }>(response);
}

export async function deleteLink(fromRouterId: string, toRouterId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/link?from_router_id=${fromRouterId}&to_router_id=${toRouterId}`, {
    method: 'DELETE',
  });
  await handleResponse<null>(response); // Expects 204 No Content
}

export async function pingRouter(routerId: string, targetIp: string): Promise<PingResult> {
  const response = await fetch(`${API_BASE_URL}/router/${routerId}/ping`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ target_ip: targetIp }),
  });
  return handleResponse<PingResult>(response);
}
