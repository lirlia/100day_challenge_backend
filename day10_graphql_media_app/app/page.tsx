"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import GraphQLViewer from '@/components/GraphQLViewer';

// Types matching GraphQL schema
interface BookBasic {
  id: string;
  title: string;
}
interface Movie {
  id: string;
  title: string;
  director: string;
  releaseYear: number;
  books: BookBasic[];
}
interface MoviesResponse {
  data?: {
    movies?: Movie[];
  };
  errors?: { message: string }[];
}


export default function MoviesPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [gqlRequest, setGqlRequest] = useState<string | null>(null);
  const [gqlResponse, setGqlResponse] = useState<any | null>(null);
  const [gqlError, setGqlError] = useState<string | null>(null);

  // Debounce effect
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500); // Wait 500ms after user stops typing

    // Cleanup function to cancel the timeout if searchTerm changes again
    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  // --- GraphQL Query Helper ---
  // (Assume executeGraphQL exists and works as before)
  const executeGraphQL = async <T,>(query: string, variables?: Record<string, any> | null): Promise<T> => {

    // --- Dedent logic for display --- START
    const lines = query.trim().split('\n');
    const minIndent = lines.reduce((min, line) => {
      if (line.trim() === '') return min; // Skip empty lines
      const currentIndent = line.match(/^\s*/)![0].length;
      return Math.min(min, currentIndent);
    }, Infinity);
    const dedentedQuery = lines.map(line => line.slice(minIndent)).join('\n');
    // --- Dedent logic for display --- END

    const operationType = dedentedQuery.startsWith('mutation') ? 'Mutation' : 'Query';
    let requestStringToDisplay = `${operationType}:\n${dedentedQuery}`; // Use dedented query
    if (variables) {
      requestStringToDisplay += `\nVariables: ${JSON.stringify(variables, null, 2)}`;
    }
    setGqlRequest(requestStringToDisplay);
    setGqlResponse(null);
    setGqlError(null);
    setError(null);

    // Construct the request body conditionally
    // Send the ORIGINAL query to the server, not the dedented one
    const bodyPayload: { query: string; variables?: Record<string, any> | null } = { query: query }; // Use original query
    if (variables) { // Only add variables key if it's not null/undefined
      bodyPayload.variables = variables;
    }

    try {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload), // Send the body with the original query
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

  // --- Fetch Movies --- (Depends on debouncedSearchTerm)
  const fetchMovies = useCallback(async () => {
    setLoading(true);
    // Restore original query with variables
    const query = `
      query GetMovies($titleContains: String) {
        movies(titleContains: $titleContains) {
          id
          title
          director
          releaseYear
          books {
            id
            title
          }
        }
      }
    `;

    // Restore variables logic
    const variables: { titleContains?: string } = {};
    if (debouncedSearchTerm.trim() !== '') {
      variables.titleContains = debouncedSearchTerm;
    }

    try {
      // Pass variables if they exist (null otherwise, handled by executeGraphQL internally potentially)
      const result = await executeGraphQL<MoviesResponse>(query, Object.keys(variables).length > 0 ? variables : null);
      if (result.data?.movies) {
        setMovies(result.data.movies);
      } else {
        setMovies([]);
        console.log("No movies found or returned from query.");
      }
    } catch (err) {
      setMovies([]); // Clear movies on error
      console.error("Failed to fetch movies:", err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchTerm]); // Restore dependency on debouncedSearchTerm

  useEffect(() => {
    fetchMovies();
  }, [fetchMovies]); // Keep dependency on fetchMovies


  // --- Render Logic ---
  return (
    <div className="flex flex-1 h-[calc(100vh-theme(space.16))]">
      {/* Left Column: Movie List & Add Button */}
      <div className="w-1/2 pr-4 overflow-y-auto"> {/* Width 1/2 */}
        <h2 className="text-2xl font-bold mb-6">Movies</h2>

        {/* Search Input */}
        <div className="mb-4">
          <input
            type="search"
            placeholder="Search movies by title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {loading ? (
          <p className="text-gray-500">Loading movies...</p>
        ) : error ? (
          <p className="text-red-500">Error: {error}</p>
        ) : movies.length > 0 ? (
          <ul className="space-y-4">
            {movies.map((movie) => (
              <li key={movie.id} className="bg-white p-4 rounded shadow hover:shadow-md transition-shadow">
                <Link href={`/movies/${movie.id}`}>
                  <h3 className="text-xl font-semibold text-indigo-600 hover:underline mb-1">{movie.title} ({movie.releaseYear})</h3>
                </Link>
                <p className="text-gray-600 text-sm mb-1">Directed by: {movie.director}</p>
                <p className="text-gray-600 text-sm">
                  Related Books: {movie.books.length > 0 ? movie.books.map(b => b.title).join(', ') : 'None'}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500">No movies found{debouncedSearchTerm ? ` matching "${debouncedSearchTerm}"` : ''}.</p>
        )}

        {/* Add New Movie Button */}
        <div className="mt-6">
          <Link href="/movies/add">
            <button className="px-4 py-2 bg-indigo-600 text-white rounded shadow hover:bg-indigo-700">
              Add New Movie
            </button>
          </Link>
        </div>
      </div>

      {/* Right Column: GraphQL Viewer */}
      <div className="w-1/2 pl-4 border-l border-gray-300 h-full"> {/* Width 1/2 */}
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
