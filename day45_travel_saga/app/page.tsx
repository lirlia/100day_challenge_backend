'use client';

import { useState } from 'react';

interface BookingDetail {
  status: string;
  reservationId?: string;
  error?: string;
}

interface SagaResponse {
  message?: string;
  details?: Record<string, BookingDetail>;
  error?: string;
  sagaId?: string;
}

export default function TravelPage() {
  const [userId, setUserId] = useState<string>('user-' + Math.random().toString(36).substring(2, 7));
  const [tripDetails, setTripDetails] = useState<string>('{\n  "destination": "Kyoto",\n  "duration": "3 days",\n  "travelers": 2,\n  "preferences": {\n    "hotel": "4-star",\n    "flight": "non-stop",\n    "car": "SUV"\n  }\n}');
  const [response, setResponse] = useState<SagaResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResponse(null);

    try {
      let parsedTripDetails;
      try {
        parsedTripDetails = JSON.parse(tripDetails);
      } catch (parseError) {
        setResponse({ error: 'Invalid JSON format for Trip Details.' });
        setIsLoading(false);
        return;
      }

      const res = await fetch('/api/travel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tripDetails: parsedTripDetails }),
      });
      const data: SagaResponse = await res.json();
      setResponse(data);
    } catch (error) {
      console.error('Error submitting travel request:', error);
      setResponse({ error: 'An unexpected error occurred.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white flex flex-col items-center py-10">
      <header className="mb-10">
        <h1 className="text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
          Day45 - Travel Booking Saga
        </h1>
        <p className="text-slate-400 text-center mt-2">Demonstrating Saga Pattern for distributed transactions.</p>
      </header>

      <main className="w-full max-w-2xl bg-slate-800 shadow-2xl rounded-lg p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="userId" className="block text-sm font-medium text-emerald-300">
              User ID
            </label>
            <input
              type="text"
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="mt-1 block w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-slate-100 placeholder-slate-400"
              placeholder="e.g., user-alpha-123"
              required
            />
          </div>

          <div>
            <label htmlFor="tripDetails" className="block text-sm font-medium text-emerald-300">
              Trip Details (JSON)
            </label>
            <textarea
              id="tripDetails"
              value={tripDetails}
              onChange={(e) => setTripDetails(e.target.value)}
              rows={10}
              className="mt-1 block w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-slate-100 placeholder-slate-400 font-mono"
              placeholder='e.g., { "destination": "Paris", "duration": "5days" }'
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          >
            {isLoading ? (
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              'Book Travel'
            )}
          </button>
        </form>

        {response && (
          <div className={`mt-8 p-6 rounded-lg shadow-md ${response.error ? 'bg-red-800 border-red-700' : 'bg-green-800 border-green-700'} border`}>
            <h2 className="text-xl font-semibold mb-3">
              {response.error ? 'Booking Failed' : 'Booking Status'}
            </h2>
            {response.sagaId && <p className="text-sm text-slate-300 mb-1">Saga ID: <span className="font-mono">{response.sagaId}</span></p>}

            {response.message && <p className="text-lg mb-2">{response.message}</p>}
            {response.error && <p className="text-lg text-red-200 mb-2">{response.error}</p>}

            {response.details && (
              <div className="mt-4 space-y-3">
                <h3 className="text-md font-medium text-slate-200">Service Details:</h3>
                {Object.entries(response.details).map(([service, detail]) => (
                  <div key={service} className={`p-3 rounded ${detail.status === 'booked' ? 'bg-green-700' : detail.status === 'failed' ? 'bg-red-700' : detail.status === 'compensated' ? 'bg-yellow-700 text-yellow-100' : 'bg-slate-700'}`}>
                    <p className="font-semibold capitalize text-slate-100">{service}: <span className={`font-normal ${detail.status === 'compensated' ? 'text-yellow-100' : 'text-slate-200'}`}>{detail.status}</span></p>
                    {detail.reservationId && <p className="text-xs text-slate-300">Reservation ID: <span className="font-mono">{detail.reservationId}</span></p>}
                    {detail.error && <p className="text-xs text-red-300">Error: {detail.error}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
      <footer className="mt-12 text-center text-sm text-slate-500">
        <p>&copy; {new Date().getFullYear()} TravelSaga Inc. All rights reserved.</p>
      </footer>
    </div>
  );
}
