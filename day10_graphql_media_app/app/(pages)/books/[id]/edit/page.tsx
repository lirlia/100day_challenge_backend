"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import GraphQLViewer from '@/components/GraphQLViewer';
import Link from 'next/link';

// Types
interface BookData {
  id: string;
  title: string;
  author: string;
  publicationYear: number;
}
interface BookDetailsResponse {
  data?: {
    book?: BookData;
  };
  errors?: { message: string }[];
}
interface MutationResponse {
  data?: {
    updateBook?: BookData;
  };
  errors?: { message: string }[];
}

export default function EditBookPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params?.id as string | undefined;

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [publicationYear, setPublicationYear] = useState<number | ''>('');
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
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

  // --- Fetch Initial Book Data ---
  const fetchInitialData = useCallback(async () => {
    if (!bookId) {
      setError("Book ID is missing.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const query = `
            query GetBookForEdit($id: ID!) {
                book(id: $id) {
                    id
                    title
                    author
                    publicationYear
                }
            }
        `;
      const result = await executeGraphQL<BookDetailsResponse>(query, { id: bookId });
      if (result.data?.book) {
        const book = result.data.book;
        setTitle(book.title);
        setAuthor(book.author);
        setPublicationYear(book.publicationYear);
        setInitialDataLoaded(true);
      } else {
        setError(`Book with ID ${bookId} not found.`);
      }
    } catch (err) {
      console.error("Failed to fetch book for editing:", err);
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);


  // --- Form Submission Handler ---
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bookId) return;

    setLoading(true);

    if (title === '' || author === '' || publicationYear === '') {
      setError('Please fill in all fields.');
      setLoading(false);
      return;
    }
    const publicationYearNum = Number(publicationYear);
    if (isNaN(publicationYearNum)) {
      setError('Publication year must be a valid number.');
      setLoading(false);
      return;
    }

    const mutation = `
      mutation UpdateExistingBook($id: ID!, $input: BookUpdateInput!) {
        updateBook(id: $id, input: $input) {
          id
          title
          author
          publicationYear
        }
      }
    `;

    const variables = {
      id: bookId,
      input: {
        title: title,
        author: author,
        publicationYear: publicationYearNum,
      }
    };

    try {
      const result = await executeGraphQL<MutationResponse>(mutation, variables);
      if (result.data?.updateBook) {
        alert('Book updated successfully!');
        router.push(`/books/${bookId}`); // Redirect to detail page
      } else {
        throw new Error('Failed to update book or unexpected response.');
      }
    } catch (err) {
      alert('Failed to update book.');
    } finally {
      setLoading(false);
    }
  };

  // --- Render Logic ---
  if (!initialDataLoaded && loading) return <p className="p-6 text-gray-500">Loading book data...</p>;
  if (error && !initialDataLoaded) return <p className="p-6 text-red-500">Error loading data: {error}</p>;
  if (!initialDataLoaded && !loading) return <p className="p-6 text-gray-500">Book not found or could not be loaded.</p>;


  return (
    <div className="flex flex-1 h-[calc(100vh-theme(space.16))]">
      {/* Left Column: Edit Form */}
      <div className="w-2/3 pr-4 overflow-y-auto">
        {error && <p className="mb-4 text-red-500 bg-red-100 p-3 rounded">Error: {error}</p>}

        <h2 className="text-2xl font-bold mb-6">Edit Book</h2>
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

            <div className="flex justify-end space-x-3 pt-4">
              <Link href={`/books/${bookId}`}>
                <button type="button" className="px-4 py-2 bg-gray-200 text-gray-700 rounded shadow hover:bg-gray-300">
                  Cancel
                </button>
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white font-semibold rounded-md shadow hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
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
