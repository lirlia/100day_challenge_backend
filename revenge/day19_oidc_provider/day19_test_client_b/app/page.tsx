'use client';

import React, { useState, useEffect } from 'react';
import { generateCodeVerifier, generateCodeChallenge, generateRandomString } from '../lib/pkce';

const OIDC_ISSUER = process.env.NEXT_PUBLIC_OIDC_ISSUER || 'http://localhost:8080';
const CLIENT_ID = process.env.NEXT_PUBLIC_OIDC_CLIENT_ID || 'client-a';
const REDIRECT_URI = process.env.NEXT_PUBLIC_OIDC_REDIRECT_URI || 'http://localhost:3002/callback';
const SCOPE = 'openid email profile';

// Simple function to get a cookie value (replace with a robust library if needed)
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null; // Avoid SSR errors
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check login status by looking for a token cookie (e.g., 'access_token')
    // In a real app, this might involve validating the token or checking a server-side session
    const token = getCookie('access_token'); // Assuming cookie is named 'access_token'
    setIsLoggedIn(!!token);

    if (token) {
      // Fetch user info if logged in
      const fetchUserInfo = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const res = await fetch('/api/proxy/userinfo', {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (!res.ok) {
            const errData = await res.json();
            // Handle token expiry or invalidity - potentially trigger logout/re-login
            if (res.status === 401) {
              console.warn('User info fetch unauthorized (token expired?). Clearing cookie.');
              // Clear the potentially invalid cookie
              document.cookie = 'access_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
              setIsLoggedIn(false);
              setUserInfo(null);
            } else {
              throw new Error(errData.error || 'Failed to fetch user info');
            }
          } else {
            const data = await res.json();
            setUserInfo(data);
          }
        } catch (err: any) {
          console.error("Error fetching user info:", err);
          setError(err.message);
          setIsLoggedIn(false); // Assume logout on error
          setUserInfo(null);
        } finally {
          setIsLoading(false);
        }
      };
      fetchUserInfo();
    } else {
      setIsLoading(false);
    }
  }, []);

  const handleLogin = async () => {
    try {
      // 1. Generate state, nonce, PKCE verifier and challenge
      const state = generateRandomString();
      const nonce = generateRandomString();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      // 2. Store state, nonce, and verifier temporarily (localStorage is simple for demo)
      // In production, consider server-side session storage for state/nonce.
      localStorage.setItem('oidc_state', state);
      localStorage.setItem('oidc_nonce', nonce);
      localStorage.setItem('oidc_code_verifier', codeVerifier);

      // 3. Construct the authorization URL
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPE,
        state: state,
        nonce: nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      const authorizeUrl = `${OIDC_ISSUER}/authorize?${params.toString()}`;

      // 4. Redirect the browser
      window.location.href = authorizeUrl;
    } catch (error) {
      console.error("Login initiation failed:", error);
      setError("Failed to start login process.");
    }
  };

  const handleLogout = async () => {
    // Call the backend logout endpoint to clear cookies
    try {
      const res = await fetch('/api/logout', { method: 'POST' });
      if (res.ok) {
        // Clear local state and redirect
        setIsLoggedIn(false);
        setUserInfo(null);
        setError(null);
        window.location.replace('/'); // Redirect to home
      } else {
        throw new Error('Logout failed on server');
      }
    } catch (err: any) {
      console.error("Logout failed:", err);
      setError(err.message || "Failed to logout.");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded bg-white p-8 text-center shadow-md">
        <h1 className="mb-6 text-3xl font-bold text-gray-800">
          Day 19 - Test Client A
        </h1>

        {isLoading && <p>Loading...</p>}

        {error && <p className="mb-4 text-red-600">Error: {error}</p>}

        {!isLoading && (
          <>
            {isLoggedIn && userInfo ? (
              <div className="space-y-4">
                <p className="text-lg text-green-700">Logged in successfully!</p>
                <div className="rounded border border-gray-200 bg-gray-50 p-4 text-left">
                  <h2 className="mb-2 text-xl font-semibold">User Info</h2>
                  <pre className="overflow-x-auto whitespace-pre-wrap text-sm">
                    {JSON.stringify(userInfo, null, 2)}
                  </pre>
                </div>
                <button
                  onClick={handleLogout}
                  className="mt-4 rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600 focus:outline-none focus:ring"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div>
                <p className="mb-4 text-gray-600">You are not logged in.</p>
                <button
                  onClick={handleLogin}
                  className="rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring focus:ring-blue-300"
                >
                  Login with OIDC Provider
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
