'use client';

import { useState, FormEvent } from 'react';
import type { Location } from '@/app/generated/prisma'; // Location 型をインポート

export default function NearbySearch() {
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [precision, setPrecision] = useState('6'); // デフォルト精度
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Location[]>([]);

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResults([]);

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const prec = parseInt(precision, 10);

    if (isNaN(lat) || isNaN(lng)) {
      setError('Latitude and Longitude must be valid numbers.');
      setIsLoading(false);
      return;
    }
    if (isNaN(prec) || prec < 1 || prec > 9) {
      setError('Precision must be a number between 1 and 9.');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/locations/nearby?lat=${lat}&lng=${lng}&precision=${prec}`);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to search nearby locations');
      }

      const data: Location[] = await res.json();
      setResults(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mb-8 p-4 border rounded-lg shadow-sm bg-white">
      <h2 className="text-xl font-semibold mb-4">Search Nearby Locations</h2>
      <form onSubmit={handleSearch}>
        {error && <p className="text-red-500 mb-4">Error: {error}</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label htmlFor="search-latitude" className="block text-sm font-medium text-gray-700 mb-1">
              Center Latitude
            </label>
            <input
              type="number"
              id="search-latitude"
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g., 35.681"
            />
          </div>
          <div>
            <label htmlFor="search-longitude" className="block text-sm font-medium text-gray-700 mb-1">
              Center Longitude
            </label>
            <input
              type="number"
              id="search-longitude"
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g., 139.767"
            />
          </div>
          <div>
            <label htmlFor="search-precision" className="block text-sm font-medium text-gray-700 mb-1">
              Geohash Precision (1-9)
            </label>
            <input
              type="number"
              id="search-precision"
              min="1"
              max="9"
              value={precision}
              onChange={(e) => setPrecision(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isLoading ? 'Searching...' : 'Search Nearby'}
        </button>
      </form>

      {results.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Search Results</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border rounded-lg shadow-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Latitude</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Longitude</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Geohash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {results.map((location) => (
                  <tr key={location.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{location.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{location.latitude}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{location.longitude}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{location.geohash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {!isLoading && results.length === 0 && latitude && longitude && (
         <p className="text-gray-500 mt-4">No nearby locations found for the specified criteria.</p>
      )}
    </div>
  );
}
