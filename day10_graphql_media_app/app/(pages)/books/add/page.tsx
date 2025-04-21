"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import GraphQLViewer from '@/components/GraphQLViewer';
import { toast } from 'react-hot-toast';

// Define the structure of the GraphQL response for addBook
interface AddBookResponse {
  data?: {
    addBook?: {
      id: string;
      title: string;
      publicationYear: number;
    };
  };
  errors?: { message: string }[];
}


export default function AddBookPage() {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [publicationYear, setPublicationYear] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

    if (!title || !author || publicationYear === '') {
      setError('Please fill in all fields.');
      setSubmitting(false);
      return;
    }
    const publicationYearNum = Number(publicationYear);
    if (isNaN(publicationYearNum)) {
      setError('Publication year must be a valid number.');
      setSubmitting(false);
      return;
    }

    const mutation = `
      mutation AddNewBook($title: String!, $author: String!, $publicationYear: Int!) {
        addBook(title: $title, author: $author, publicationYear: $publicationYear) {
          id
          title
          publicationYear
        }
      }
    `;

    const variables = {
      title,
      author,
      publicationYear: publicationYearNum,
    };

    setGqlRequest(`Mutation: addBook\nVariables: ${JSON.stringify(variables, null, 2)}`);

    try {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: mutation, variables }),
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const result: AddBookResponse = await res.json();
      setGqlResponse(result);

      if (result.errors) {
        console.error('GraphQL Errors:', result.errors);
        setGqlError(result.errors.map(e => e.message).join('\n'));
        setError('Failed to add book due to GraphQL errors.');
        toast.error('Failed to add book due to GraphQL errors.');
      } else if (result.data?.addBook) {
        console.log('Book added:', result.data.addBook);
        setGqlError(null);
        toast.success('Book added successfully!');
        router.push('/books'); // Redirect to books list
      } else {
        console.error("Unexpected response structure:", result);
        setGqlError("Received unexpected data structure from API.");
        setError('Failed to add book. Unexpected API response.');
        toast.error('Failed to add book. Unexpected API response.');
      }

    } catch (err: any) {
      console.error('Submission Error:', err);
      setError(err.message || 'Failed to submit the form.');
      setGqlError(null);
      toast.error('Failed to add book.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 h-[calc(100vh-theme(space.16))]">
      {/* Left Column: Add Book Form */}
      <div className="w-2/3 pr-4 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6">Add New Book</h2>
        <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded shadow-md">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div>
            <label htmlFor="author" className="block text-sm font-medium text-gray-700 mb-1">Author</label>
            <input
              type="text"
              id="author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div>
            <label htmlFor="publicationYear" className="block text-sm font-medium text-gray-700 mb-1">Publication Year</label>
            <input
              type="number"
              id="publicationYear"
              value={publicationYear}
              onChange={(e) => setPublicationYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-4 bg-green-600 text-white font-semibold rounded-md shadow hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Add Book'}
          </button>
        </form>
      </div>

      {/* Right Column: GraphQL Viewer */}
      <div className="w-1/3 pl-4 border-l border-gray-300 h-full">
        <div className="sticky top-0 h-full">
          <GraphQLViewer
            requestQuery={gqlRequest}
            responseJson={gqlResponse}
            error={gqlError || error}
          />
        </div>
      </div>
    </div>
  );
}
