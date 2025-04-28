'use client';

import React, { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const interactionId = searchParams.get('interaction_id');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!interactionId) {
      setError('Missing interaction_id');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/proxy/interaction/login', { // Use proxy route
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          interaction_id: interactionId,
          email: email,
          password: password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Successful login, Go backend should redirect the browser via response headers
      // If the response indicates a redirect, Next.js fetch won't follow automatically
      // Check if the backend wants us to redirect (e.g., back to /authorize)
      if (data.redirect_to) {
        // Use window.location.replace for full page navigation
        window.location.replace(data.redirect_to);
      } else {
        // Should not happen in typical OIDC flow, but handle gracefully
        setError('Login successful, but no redirect information received.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!interactionId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="rounded bg-white p-8 shadow-md">
          <h1 className="text-2xl font-bold text-red-600">Error</h1>
          <p className="text-gray-700">Missing interaction_id parameter.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md rounded bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-3xl font-bold text-gray-800">
          Login - OIDC Provider
        </h1>
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="mb-4 rounded bg-red-100 p-3 text-center text-red-700">
              {error}
            </div>
          )}
          <input
            type="hidden"
            name="interaction_id"
            value={interactionId}
          />
          <div className="mb-4">
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-gray-300 p-2 focus:border-blue-500 focus:outline-none focus:ring"
              disabled={isLoading}
            />
          </div>
          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded border border-gray-300 p-2 focus:border-blue-500 focus:outline-none focus:ring"
              disabled={isLoading}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded bg-blue-600 p-2 text-white hover:bg-blue-700 focus:outline-none focus:ring focus:ring-blue-300 disabled:opacity-50"
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
