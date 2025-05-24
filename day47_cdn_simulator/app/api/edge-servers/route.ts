import { NextResponse } from 'next/server';
import { getAllEdgeServers, createEdgeServer, deleteEdgeServerByServerId } from '@/lib/db';
import type { EdgeServer } from '@/app/_lib/types';
import { REGIONS } from '@/app/_lib/types';

const VALID_REGIONS = REGIONS.map(r => r.id);

// GET all edge servers
export async function GET() {
  try {
    const servers = getAllEdgeServers() as EdgeServer[];
    return NextResponse.json(servers);
  } catch (error: any) {
    console.error("Error fetching edge servers:", error);
    return NextResponse.json({ error: 'Failed to fetch edge servers', details: error.message }, { status: 500 });
  }
}

// POST a new edge server
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { server_id, region, cache_capacity, default_ttl } = body;

    if (!server_id || !region || cache_capacity === undefined || default_ttl === undefined) {
      return NextResponse.json({ error: 'Missing required fields: server_id, region, cache_capacity, default_ttl' }, { status: 400 });
    }

    if (!VALID_REGIONS.includes(region)) {
      return NextResponse.json({ error: `Invalid region. Must be one of: ${VALID_REGIONS.join(', ')}` }, { status: 400 });
    }

    if (typeof cache_capacity !== 'number' || cache_capacity <= 0) {
      return NextResponse.json({ error: 'cache_capacity must be a positive number' }, { status: 400 });
    }
    if (typeof default_ttl !== 'number' || default_ttl < 0) {
      return NextResponse.json({ error: 'default_ttl must be a non-negative number' }, { status: 400 });
    }

    const newServer = createEdgeServer(server_id, region, cache_capacity, default_ttl) as EdgeServer;
    return NextResponse.json(newServer, { status: 201 });
  } catch (error: any) {
    console.error("Error creating edge server:", error);
    if (error.message.includes('already exists')) {
        return NextResponse.json({ error: 'Failed to create edge server', details: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create edge server', details: error.message }, { status: 500 });
  }
}

// DELETE an edge server by its user-defined server_id
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const serverId = searchParams.get('server_id');

    if (!serverId) {
      return NextResponse.json({ error: 'Missing server_id query parameter' }, { status: 400 });
    }

    const changes = deleteEdgeServerByServerId(serverId);

    if (changes === 0) {
      return NextResponse.json({ error: 'Edge server not found or already deleted' }, { status: 404 });
    }

    return NextResponse.json({ message: `Edge server '${serverId}' deleted successfully` });
  } catch (error: any) {
    console.error("Error deleting edge server:", error);
    return NextResponse.json({ error: 'Failed to delete edge server', details: error.message }, { status: 500 });
  }
}
