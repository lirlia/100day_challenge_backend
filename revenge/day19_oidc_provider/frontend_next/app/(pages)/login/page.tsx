'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const interactionId = searchParams.get('interaction_id');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [clientName, setClientName] = useState<string>('');

  useEffect(() => {
    if (interactionId) {
      // Fetch interaction details to display client name, etc.
      fetch(`/api/interaction/${interactionId}/details`)
        .then(res => res.ok ? res.json() : Promise.reject('Failed to fetch details'))
        .then(data => {
          setClientName(data.client?.name || 'Unknown Application');
        })
        .catch(err => {
          console.error('Error fetching interaction details:', err);
          setError('Could not load interaction details.');
        });
    }
  }, [interactionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interactionId) {
      setError('Missing interaction context.');
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/interaction/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, interactionId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Redirect user back to the Go backend's redirect URI
      if (data.redirectTo) {
        window.location.href = data.redirectTo;
      } else {
        setError('Login successful, but no redirect URI provided.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Log in to Continue</h1>
        {clientName && (
          <p className="text-center text-gray-600 mb-4">
            Sign in to grant <span className="font-semibold">{clientName}</span> access.
          </p>
        )}
        {error && <p className="text-red-500 mb-4 text-center">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isLoading}
            />
          </div>
          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isLoading}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !interactionId}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {isLoading ? 'Logging in...' : 'Log In'}
          </button>
          {!interactionId && <p className="text-xs text-red-600 text-center mt-2">Interaction ID is missing. Cannot proceed.</p>}
        </form>
      </div>
    </div>
  );
}
