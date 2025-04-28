import { NextRequest, NextResponse } from 'next/server';

const GO_BACKEND_URL = process.env.GO_BACKEND_URL || 'http://localhost:8080';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward the POST request to the Go backend
    const backendResponse = await fetch(`${GO_BACKEND_URL}/interaction/consent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward other necessary headers if needed
      },
      body: JSON.stringify(body),
    });

    const data = await backendResponse.json();

    // Forward the response (including status code) from the Go backend
    return NextResponse.json(data, { status: backendResponse.status });

  } catch (error) {
    console.error('Error proxying /interaction/consent:', error);
    // Check if error is due to invalid JSON
    if (error instanceof SyntaxError) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
