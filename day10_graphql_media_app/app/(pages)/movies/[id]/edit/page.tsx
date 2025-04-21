"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import GraphQLViewer from '@/components/GraphQLViewer';
import Link from 'next/link';


// Types (reusing from detail page where applicable)
interface MovieData {
  id: string;
  title: string;
  director: string;
  releaseYear: number;
}
interface MovieDetailsResponse {
  data?: {
    movie?: MovieData;
  };
  errors?: { message: string }[];
}
interface MutationResponse {
  data?: {
    updateMovie?: MovieData; // Expect updated movie data
  };
  errors?: { message: string }[];
}

export default function EditMoviePage() {
  const params = useParams();
  const router = useRouter();
  const movieId = params?.id as string | undefined;

  const [title, setTitle] = useState('');
  const [director, setDirector] = useState('');
  const [releaseYear, setReleaseYear] = useState<number | ''>('');
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [loading, setLoading] = useState<boolean>(false); // For form submission/initial load
  const [error, setError] = useState<string | null>(null);
  const [gqlRequest, setGqlRequest] = useState<string | null>(null);
  const [gqlResponse, setGqlResponse] = useState<any | null>(null);
  const [gqlError, setGqlError] = useState<string | null>(null);

  // --- GraphQL Helper (reused) ---
  const executeGraphQL = async <T,>(query: string, variables?: Record<string, any>): Promise<T> => {
    setGqlRequest(variables ? `${query}\nVariables: ${JSON.stringify(variables, null, 2)}` : query);
    setGqlResponse(null);
    setGqlError(null);
    setError(null);

    try {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const result = await res.json();
      setGqlResponse(result);

      if (result.errors) {
        console.error('GraphQL Errors:', result.errors);
        const errorMessages = result.errors.map((e: { message: string }) => e.message).join('\n');
        setGqlError(errorMessages);
        throw new Error(errorMessages);
      }
      if (!result.data) {
        // Allow mutations that might return null data on success (like delete)
        // but for queries or updates expecting data, this is an issue.
        if (!query.trim().startsWith("mutation")) {
          throw new Error('No data returned from GraphQL query.');
        }
      }
      return result;

    } catch (err: any) {
      console.error('GraphQL Execution Error:', err);
      setError(err.message || 'An error occurred.');
      setGqlError(err.message || 'An error occurred.');
      throw err;
    }
  };


  // --- Fetch Initial Movie Data ---
  const fetchInitialData = useCallback(async () => {
    if (!movieId) {
      setError("Movie ID is missing.");
      setLoading(false); // Stop loading if no ID
      return;
    }
    setLoading(true);
    try {
      const query = `
            query GetMovieForEdit($id: ID!) {
                movie(id: $id) {
                    id
                    title
                    director
                    releaseYear
                }
            }
         `;
      const result = await executeGraphQL<MovieDetailsResponse>(query, { id: movieId });
      if (result.data?.movie) {
        const movie = result.data.movie;
        setTitle(movie.title);
        setDirector(movie.director);
        setReleaseYear(movie.releaseYear);
        setInitialDataLoaded(true); // Mark initial load complete
      } else {
        setError(`Movie with ID ${movieId} not found.`);
      }
    } catch (err) {
      // Error state handled by executeGraphQL
      console.error("Failed to fetch movie for editing:", err);
    } finally {
      setLoading(false);
    }
  }, [movieId]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);


  // --- Form Submission Handler ---
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!movieId) return;

    setLoading(true); // Indicate submission is in progress

    // Basic validation
    if (title === '' || director === '' || releaseYear === '') {
      setError('Please fill in all fields.');
      setLoading(false);
      return;
    }
    const releaseYearNum = Number(releaseYear);
    if (isNaN(releaseYearNum)) {
      setError('Release year must be a valid number.');
      setLoading(false);
      return;
    }


    const mutation = `
      mutation UpdateExistingMovie($id: ID!, $input: MovieUpdateInput!) {
        updateMovie(id: $id, input: $input) {
          id
          title
          director
          releaseYear
        }
      }
    `;

    const variables = {
      id: movieId,
      input: { // Corresponds to MovieUpdateInput type in GraphQL schema
        title: title,
        director: director,
        releaseYear: releaseYearNum,
      }
    };

    try {
      const result = await executeGraphQL<MutationResponse>(mutation, variables);
      if (result.data?.updateMovie) {
        alert('Movie updated successfully!');
        router.push(`/movies/${movieId}`); // Redirect to detail page
      } else {
        // This case might happen if the update returns null (e.g., movie deleted concurrently)
        // Or if the response structure is unexpected.
        throw new Error('Failed to update movie or unexpected response.');
      }
    } catch (err) {
      alert('Failed to update movie.'); // Inform user
      // Error state is already set by executeGraphQL
    } finally {
      setLoading(false); // Finish submission loading state
    }
  };


  // --- Render Logic ---
  // Display loading state only during the initial data fetch
  if (!initialDataLoaded && loading) return <p className="p-6 text-gray-500">Loading movie data...</p>;
  if (error && !initialDataLoaded) return <p className="p-6 text-red-500">Error loading data: {error}</p>;
  if (!initialDataLoaded && !loading) return <p className="p-6 text-gray-500">Movie not found or could not be loaded.</p>; // Should ideally check for movie existence


  return (
    <div className="flex flex-1 h-[calc(100vh-theme(space.16))]">
      {/* Left Column: Edit Form */}
      <div className="w-2/3 pr-4 overflow-y-auto">
        {/* Display submission/fetch errors */}
        {error && <p className="mb-4 text-red-500 bg-red-100 p-3 rounded">Error: {error}</p>}

        <h2 className="text-2xl font-bold mb-6">Edit Movie</h2>
        {/* Only render form if initial data is loaded */}
        {initialDataLoaded && (
          <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded shadow-md">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="director" className="block text-sm font-medium text-gray-700 mb-1">Director</label>
              <input
                type="text"
                id="director"
                value={director}
                onChange={(e) => setDirector(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="releaseYear" className="block text-sm font-medium text-gray-700 mb-1">Release Year</label>
              <input
                type="number"
                id="releaseYear"
                value={releaseYear}
                onChange={(e) => setReleaseYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Link href={`/movies/${movieId}`}>
                <button type="button" className="px-4 py-2 bg-gray-200 text-gray-700 rounded shadow hover:bg-gray-300">
                  Cancel
                </button>
              </Link>
              <button
                type="submit"
                disabled={loading} // Disable button during submission
                className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Right Column: GraphQL Viewer */}
      <div className="w-1/3 pl-4 border-l border-gray-300 h-full">
        <div className="sticky top-0 h-full">
          <GraphQLViewer
            requestQuery={gqlRequest}
            responseJson={gqlResponse}
            error={gqlError}
          />
        </div>
      </div>
    </div>
  );
}
