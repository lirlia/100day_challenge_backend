import { NextRequest, NextResponse } from 'next/server';

// Define the target Go backend URL
const GO_BACKEND_URL = process.env.GO_BACKEND_URL || 'http://localhost:8080';

// This handler proxies requests from the Next.js frontend to the Go backend.
// It helps avoid CORS issues during development if the frontend and backend
// are served on different ports.
async function handler(req: NextRequest, { params }: { params: { path: string[] } }) {
  // Construct the target URL for the Go backend
  const targetPath = params.path.join('/');
  const targetUrl = `${GO_BACKEND_URL}/${targetPath}`;

  // Create a new Headers object, copying necessary headers from the incoming request
  const headers = new Headers();
  headers.set('Content-Type', req.headers.get('Content-Type') || 'application/json');
  // Add any other headers you need to forward, e.g., Authorization
  // if (req.headers.get('Authorization')) {
  //   headers.set('Authorization', req.headers.get('Authorization')!);
  // }

  console.log(`[Proxy] Forwarding ${req.method} request to ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.body, // Forward the request body
      // duplex: 'half' might be needed for certain types of streaming requests
      // redirect: 'manual', // Important: Do not automatically follow redirects
    });

    // Create a new response based on the backend response
    // Forward status, headers, and body
    const responseHeaders = new Headers(response.headers);
    // Ensure CORS headers are handled if needed, though the backend should ideally set them

    // Log the backend response status
    console.log(`[Proxy] Received ${response.status} from ${targetUrl}`);

    // If the backend responded with a redirect (e.g., after login/consent)
    // we need to signal this back to the frontend client-side code.
    // We cannot directly return a 3xx redirect from the API route that fetch() will follow.
    if (response.status >= 300 && response.status < 400 && response.headers.get('Location')) {
      console.log(`[Proxy] Backend responded with redirect to: ${response.headers.get('Location')}`);
      // Return a JSON response indicating the redirect URL
      return NextResponse.json(
        { redirect_to: response.headers.get('Location') },
        { status: 200 } // Return 200 OK to the client, letting client-side JS handle the redirect
      );
    }

    // For non-redirect responses, stream the body back
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error(`[Proxy] Error forwarding request to ${targetUrl}:`, error);
    return NextResponse.json(
      { error: 'Proxy error', details: (error as Error).message },
      { status: 502 } // Bad Gateway
    );
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE, handler as PATCH, handler as OPTIONS };
