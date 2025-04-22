import { NextResponse } from 'next/server';
import { getAllDatasets } from '../../_lib/datasets'; // Import from the new lib

export async function GET() {
  try {
    const datasets = await getAllDatasets();

    // Return only id and name to the client
    const clientDatasets = datasets.map(({ id, name }) => ({ id, name }));
    return NextResponse.json({ datasets: clientDatasets });
  } catch (error) {
    console.error('GET /api/datasets error:', error);
    return NextResponse.json({ error: 'Failed to retrieve datasets' }, { status: 500 });
  }
}
