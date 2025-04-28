import { NextRequest, NextResponse } from 'next/server';

const GO_BACKEND_URL = process.env.GO_BACKEND_URL || 'http://localhost:8080';

export async function GET(
  request: NextRequest,
  { params }: { params: { interactionId: string } }
) {
  const awaitedParams = await params;
  const interactionId = awaitedParams.interactionId;

  if (!interactionId) {
    return NextResponse.json({ error: 'Interaction ID is required' }, { status: 400 });
  }

  try {
    const backendResponse = await fetch(`${GO_BACKEND_URL}/interaction/${interactionId}/details`, {
      method: 'GET',
      headers: {
        // Forward any necessary headers, e.g., cookies if needed
        // 'Cookie': request.headers.get('Cookie') || '',
      },
    });

    const data = await backendResponse.json();

    if (!backendResponse.ok) {
      // Forward the error from the Go backend
      return NextResponse.json(data, { status: backendResponse.status });
    }

    // Forward the successful response from the Go backend
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error proxying /interaction/details:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
