'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface InteractionDetails {
  client?: {
    name: string;
    // logo_uri: string;
  };
  scopes?: string[];
  error?: string;
  error_description?: string;
}

export default function ConsentPage() {
  const searchParams = useSearchParams();
  const interactionId = searchParams.get('interaction_id');
  const [details, setDetails] = useState<InteractionDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (interactionId) {
      setIsLoading(true);
      fetch(`/api/interaction/${interactionId}/details`)
        .then(res => res.ok ? res.json() : Promise.reject('Failed to fetch details'))
        .then(data => {
          if (data.error) {
            setError(`${data.error}: ${data.error_description || 'Unknown error'}`);
          } else {
            setDetails(data);
          }
        })
        .catch(err => {
          console.error('Error fetching interaction details:', err);
          setError('Could not load interaction details.');
        })
        .finally(() => setIsLoading(false));
    } else {
      setError('Missing interaction context.');
      setIsLoading(false);
    }
  }, [interactionId]);

  const handleConsent = async (allow: boolean) => {
    if (!interactionId) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/interaction/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interactionId, allow }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Consent submission failed');
      }
      if (data.redirectTo) {
        window.location.href = data.redirectTo;
      } else {
        setError('Consent submitted, but no redirect URI provided.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      setIsLoading(false);
    }
    // Don't set isLoading to false if redirecting
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
          <h1 className="text-xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!details || !details.client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-700 mb-4">Invalid Request</h1>
          <p>Could not load application details.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4">Grant Access?</h1>
        <p className="text-gray-700 mb-6">
          <span className="font-semibold">{details.client.name}</span> is requesting access to your account.
        </p>

        {details.scopes && details.scopes.length > 0 && (
          <div className="mb-6 text-left">
            <p className="font-medium text-gray-800 mb-2">This will allow the application to:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              {details.scopes.filter(s => s !== 'openid').map(scope => (
                <li key={scope}>Access your {scope === 'email' ? 'email address' : scope === 'profile' ? 'basic profile information' : scope}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-center space-x-4">
          <button
            onClick={() => handleConsent(false)}
            disabled={isLoading}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            Deny
          </button>
          <button
            onClick={() => handleConsent(true)}
            disabled={isLoading}
            className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
