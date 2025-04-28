'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function CallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const code = searchParams.get('code');
    const stateReceived = searchParams.get('state');
    const errorReceived = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (errorReceived) {
      setError(`OIDC Error: ${errorReceived} - ${errorDescription || 'No description provided.'}`);
      setIsLoading(false);
      // Optionally clear stored state here
      localStorage.removeItem('oidc_state');
      localStorage.removeItem('oidc_nonce');
      localStorage.removeItem('oidc_code_verifier');
      return;
    }

    if (!code) {
      setError('Authorization code not found in callback URL.');
      setIsLoading(false);
      return;
    }

    // Retrieve stored state and verifier
    const stateStored = localStorage.getItem('oidc_state');
    const codeVerifier = localStorage.getItem('oidc_code_verifier');

    // Clear stored values immediately after retrieving
    localStorage.removeItem('oidc_state');
    localStorage.removeItem('oidc_nonce'); // Nonce might be needed later if validating id_token
    localStorage.removeItem('oidc_code_verifier');

    if (!stateStored || !codeVerifier) {
      setError('State or code verifier not found in local storage. Login flow may have expired or been tampered with.');
      setIsLoading(false);
      return;
    }

    if (stateReceived !== stateStored) {
      setError('State parameter mismatch. Possible CSRF attack.');
      setIsLoading(false);
      return;
    }

    // Exchange code for tokens
    const exchangeCode = async () => {
      try {
        const response = await fetch('/api/proxy/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.NEXT_PUBLIC_OIDC_REDIRECT_URI || 'http://localhost:3002/callback',
            client_id: process.env.NEXT_PUBLIC_OIDC_CLIENT_ID || 'client-a',
            code_verifier: codeVerifier,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Token exchange failed');
        }

        // --- Token Storage ---
        // Tokens received (data.access_token, data.id_token)
        // Send them to a server-side API route to store them in secure HttpOnly cookies
        const saveTokenResponse = await fetch('/api/save-tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: data.access_token, idToken: data.id_token }),
        });

        if (!saveTokenResponse.ok) {
          throw new Error('Failed to save tokens securely.');
        }
        // --- End Token Storage ---

        // Redirect to home page after successful login
        router.replace('/');

      } catch (err: any) {
        console.error("Token exchange error:", err);
        setError(err.message || 'An error occurred during token exchange.');
        setIsLoading(false);
      }
    };

    exchangeCode();

  }, [searchParams, router]); // Add router to dependency array

  return (
    <div className="flex min-h-screen items-center justify-center">
      {isLoading && <p>Processing login callback...</p>}
      {error && (
        <div className="rounded bg-red-100 p-4 text-red-700">
          <h2 className="font-bold">Login Error</h2>
          <p>{error}</p>
          <a href="/" className="mt-2 inline-block text-blue-600 hover:underline">Go back home</a>
        </div>
      )}
    </div>
  );
}
