"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation'; // For redirection
import GraphQLViewer from '@/components/GraphQLViewer';
import { toast } from 'react-hot-toast';

// Define the structure of the GraphQL response for addMovie
interface AddMovieResponse {
  data?: {
    addMovie?: {
      id: string;
      title: string;
      releaseYear: number;
    };
  };
  errors?: { message: string }[];
}

export default function AddMoviePage() {
  const [title, setTitle] = useState('');
  const [director, setDirector] = useState('');
  const [releaseYear, setReleaseYear] = useState<number | ''>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null); // For fetch/submission errors
  const [gqlRequest, setGqlRequest] = useState<string | null>(null);
  const [gqlResponse, setGqlResponse] = useState<any | null>(null);
  const [gqlError, setGqlError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setGqlError(null);
    setGqlResponse(null);

    // Basic validation
    if (!title || !director || releaseYear === '') {
      setError('Please fill in all fields.');
      setSubmitting(false);
      return;
    }
    // Ensure releaseYear is a number before sending
    const releaseYearNum = Number(releaseYear);
    if (isNaN(releaseYearNum)) {
      setError('Release year must be a valid number.');
      setSubmitting(false);
      return;
    }


    const mutation = `
      mutation AddNewMovie($title: String!, $director: String!, $releaseYear: Int!) {
        addMovie(title: $title, director: $director, releaseYear: $releaseYear) {
          id
          title
          releaseYear
        }
      }
    `;

    const variables = {
      title,
      director,
      releaseYear: releaseYearNum,
    };

    // Display the request (mutation + variables)
    setGqlRequest(`Mutation: addMovie\nVariables: ${JSON.stringify(variables, null, 2)}`);

    try {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: mutation, variables }), // Send mutation and variables
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const result: AddMovieResponse = await res.json();
      setGqlResponse(result);

      if (result.errors) {
        console.error('GraphQL Errors:', result.errors);
        setGqlError(result.errors.map(e => e.message).join('\n'));
        setError('Failed to add movie due to GraphQL errors.'); // Show error to user
      } else if (result.data?.addMovie) {
        console.log('Movie added:', result.data.addMovie);
        setGqlError(null);
        toast.success('Movie added successfully!');
        router.push('/movies');
      } else {
        console.error("Unexpected response structure:", result);
        setGqlError("Received unexpected data structure from API.");
        setError('Failed to add movie. Unexpected API response.');
      }

    } catch (err: any) {
      console.error('Submission Error:', err);
      setError(err.message || 'Failed to submit the form.');
      setGqlError(null);
      toast.error('Failed to add movie.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 h-[calc(100vh-theme(space.16))]">
      {/* Left Column: Add Movie Form */}
      <div className="w-2/3 pr-4 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6">Add New Movie</h2>
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

          {/* Display Submission Error */}
          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}


          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-4 bg-indigo-600 text-white font-semibold rounded-md shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Add Movie'}
          </button>
        </form>
      </div>

      {/* Right Column: GraphQL Viewer */}
      <div className="w-1/3 pl-4 border-l border-gray-300 h-full">
        <div className="sticky top-0 h-full">
          <GraphQLViewer
            requestQuery={gqlRequest}
            responseJson={gqlResponse}
            error={gqlError || error} // Show form submission error or GraphQL error
          />
        </div>
      </div>
    </div>
  );
}
