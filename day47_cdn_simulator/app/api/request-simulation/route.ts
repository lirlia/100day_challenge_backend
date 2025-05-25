import { NextResponse } from 'next/server';
import { simulateRequest } from '@/app/_lib/cdn-logic';
import type { RegionId } from '@/app/_lib/types';
import { REGIONS } from '@/app/_lib/types';

const VALID_REGIONS = REGIONS.map(r => r.id);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_region, content_id } = body;

    if (!client_region || !content_id) {
      return NextResponse.json({ error: 'Missing required fields: client_region, content_id' }, { status: 400 });
    }

    if (!VALID_REGIONS.includes(client_region as RegionId)) {
      return NextResponse.json({ error: `Invalid client_region. Must be one of: ${VALID_REGIONS.join(', ')}` }, { status: 400 });
    }

    const result = await simulateRequest(client_region as RegionId, content_id as string);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error("Error during request simulation:", error);
    return NextResponse.json({ error: 'Failed to simulate request', details: error.message }, { status: 500 });
  }
}
