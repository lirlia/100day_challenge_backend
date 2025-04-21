"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import GraphQLViewer from '@/components/GraphQLViewer'; // Assuming alias `@` is configured

// Define a basic type for Movie data received from GraphQL
// Match the structure defined in your GraphQL query
interface MovieData {
  id: string;
  title: string;
  director: string;
  releaseYear: number;
  books: { id: string; title: string }[]; // Include related books if fetched
}

// Define the structure of the GraphQL response (data or errors)
interface GraphQLResponse {
  data?: {
    movies?: MovieData[];
  };
  errors?: { message: string }[];
}


export default function MoviesPage() {
  const [movies, setMovies] = useState<MovieData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null); // For fetch errors
  const [gqlRequest, setGqlRequest] = useState<string | null>(null);
  const [gqlResponse, setGqlResponse] = useState<any | null>(null); // Store the full response
  const [gqlError, setGqlError] = useState<string | null>(null);   // For GraphQL errors in the response

  useEffect(() => {
    const fetchMovies = async () => {
      setLoading(true);
      setError(null);
      setGqlError(null);
      setGqlResponse(null); // Clear previous response

      const query = `
        query GetMovies {
          movies {
            id
            title
            director
            releaseYear
            books { # Include books for potential display
              id
              title
            }
          }
        }
      `;
      setGqlRequest(query); // Store the request query

      try {
        const res = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query }),
        });

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const result: GraphQLResponse = await res.json();
        setGqlResponse(result); // Store the full response

        if (result.errors) {
          // Handle GraphQL errors
          console.error('GraphQL Errors:', result.errors);
          setGqlError(result.errors.map(e => e.message).join('\n'));
          setMovies([]); // Clear movies on GraphQL error
        } else if (result.data?.movies) {
          // Handle successful data fetch
          setMovies(result.data.movies);
          setGqlError(null); // Clear any previous GraphQL error
        } else {
          // Handle unexpected response structure
          console.error("Unexpected response structure:", result);
          setGqlError("Received unexpected data structure from API.");
          setMovies([]);
        }

      } catch (err: any) {
        console.error('Fetch Error:', err);
        setError(err.message || 'Failed to fetch movies.');
        setGqlError(null); // Clear GraphQL error on fetch error
        setMovies([]); // Clear movies on fetch error
      } finally {
        setLoading(false);
      }
    };

    fetchMovies();
  }, []); // Empty dependency array means this runs once on mount

  return (
    <div className="flex flex-1 h-[calc(100vh-theme(space.16))]"> {/* Adjust height based on header */}
      {/* Left Column: Movie List */}
      <div className="w-2/3 pr-4 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Movies</h2>
        {loading && <p className="text-gray-500">Loading movies...</p>}
        {error && <p className="text-red-500">Error fetching movies: {error}</p>}

        {!loading && !error && (
          <ul className="space-y-3">
            {movies.length > 0 ? (
              movies.map((movie) => (
                <li key={movie.id} className="bg-white p-4 rounded shadow hover:shadow-md transition-shadow">
                  {/* Link to detail page (implement later) */}
                  <Link href={`/movies/${movie.id}`} className="text-blue-600 hover:underline">
                    <h3 className="text-lg font-semibold">{movie.title} ({movie.releaseYear})</h3>
                  </Link>
                  <p className="text-gray-600 text-sm">Directed by: {movie.director}</p>
                  {/* Optional: Display related books count or titles */}
                  {movie.books && movie.books.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Related Books: {movie.books.length}
                    </p>
                  )}
                </li>
              ))
            ) : (
              // Display message if no movies found after loading (and no error)
              <p className="text-gray-500">No movies found.</p>
            )}
          </ul>
        )}
        {/* Add Movie Button */}
        <div className="mt-6">
          <Link href="/movies/add">
            <button className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700">
              Add New Movie
            </button>
          </Link>
        </div>
      </div>

      {/* Right Column: GraphQL Viewer */}
      <div className="w-1/3 pl-4 border-l border-gray-300 h-full">
        <div className="sticky top-0 h-full"> {/* Make viewer sticky within its column */}
          <GraphQLViewer
            requestQuery={gqlRequest}
            responseJson={gqlResponse}
            error={gqlError || error} // Show fetch error or GraphQL error
          />
        </div>
      </div>
    </div>
  );
}
