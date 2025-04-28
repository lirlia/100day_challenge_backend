'use client';

import React, { FormEvent, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface InteractionDetails {
  prompt: string;
  client_name?: string;
  scopes_requested?: string[];
}

export default function ConsentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const interactionId = searchParams.get('interaction_id');

  const [details, setDetails] = useState<InteractionDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!interactionId) {
      setError('Missing interaction_id');
      setIsLoading(false);
      return;
    }

    const fetchDetails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/proxy/interaction/${interactionId}/details`);
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to fetch interaction details');
        }
        const data: InteractionDetails = await response.json();
        if (data.prompt !== 'consent') {
          throw new Error('Invalid interaction state for consent');
        }
        setDetails(data);
      } catch (err: any) {
        console.error('Error fetching interaction details:', err);
        setError(err.message || 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [interactionId]);

  const handleSubmit = async (allow: boolean) => {
    if (!interactionId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/proxy/interaction/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          interaction_id: interactionId,
          decision: allow ? 'allow' : 'deny',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Consent submission failed');
      }

      // Consent processed, backend should provide redirect URL
      if (data.redirect_to) {
        window.location.replace(data.redirect_to);
      } else {
        setError('Consent submission successful, but no redirect information received.');
      }
    } catch (err: any) {
      console.error('Consent submission error:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="rounded bg-white p-8 text-center shadow-md">
          <h1 className="mb-4 text-2xl font-bold text-red-600">Error</h1>
          <p className="text-gray-700">{error || 'Could not load consent details.'}</p>
          {!interactionId && <p className="mt-2 text-sm text-gray-500">Interaction ID is missing.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-lg rounded bg-white p-8 shadow-md">
        <h1 className="mb-4 text-center text-2xl font-bold text-gray-800">
          Authorize Application
        </h1>
        <p className="mb-6 text-center text-gray-600">
          The application{' '}
          <strong className="font-semibold">{details.client_name || 'Unknown App'}</strong>{' '}
          would like permission to access the following information associated with your account:
        </p>

        <ul className="mb-6 list-inside list-disc space-y-1 text-gray-700">
          {details.scopes_requested?.map((scope) => (
            <li key={scope}>{scope === 'openid' ? 'Authenticate you' : scope}</li>
          )) || <li>Basic authentication</li>}
        </ul>

        {error && (
          <div className="mb-4 rounded bg-red-100 p-3 text-center text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-center space-x-4">
          <button
            onClick={() => handleSubmit(false)} // Deny
            disabled={isSubmitting}
            className="rounded bg-gray-300 px-6 py-2 text-gray-800 hover:bg-gray-400 focus:outline-none focus:ring focus:ring-gray-300 disabled:opacity-50"
          >
            {isSubmitting ? 'Processing...' : 'Deny'}
          </button>
          <button
            onClick={() => handleSubmit(true)} // Allow
            disabled={isSubmitting}
            className="rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring focus:ring-blue-300 disabled:opacity-50"
          >
            {isSubmitting ? 'Processing...' : 'Allow'}
          </button>
        </div>
      </div>
    </div>
  );
}
