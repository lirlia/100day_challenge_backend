"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import GraphQLViewer from '@/components/GraphQLViewer';

// Define a basic type for Book data received from GraphQL
interface BookData {
  id: string;
  title: string;
  author: string;
  publicationYear: number;
  movies: { id: string; title: string }[]; // Include related movies
}

// Define the structure of the GraphQL response
interface GraphQLResponse {
  data?: {
    books?: BookData[];
  };
  errors?: { message: string }[];
}

export default function BooksPage() {
  const [books, setBooks] = useState<BookData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [gqlRequest, setGqlRequest] = useState<string | null>(null);
  const [gqlResponse, setGqlResponse] = useState<any | null>(null);
  const [gqlError, setGqlError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBooks = async () => {
      setLoading(true);
      setError(null);
      setGqlError(null);
      setGqlResponse(null);

      const query = `
        query GetBooks {
          books {
            id
            title
            author
            publicationYear
            movies { # Include movies
              id
              title
            }
          }
        }
      `;
      setGqlRequest(query);

      try {
        const res = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });

        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

        const result: GraphQLResponse = await res.json();
        setGqlResponse(result);

        if (result.errors) {
          console.error('GraphQL Errors:', result.errors);
          setGqlError(result.errors.map(e => e.message).join('\n'));
          setBooks([]);
        } else if (result.data?.books) {
          setBooks(result.data.books);
          setGqlError(null);
        } else {
          console.error("Unexpected response structure:", result);
          setGqlError("Received unexpected data structure from API.");
          setBooks([]);
        }

      } catch (err: any) {
        console.error('Fetch Error:', err);
        setError(err.message || 'Failed to fetch books.');
        setGqlError(null);
        setBooks([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, []);

  return (
    <div className="flex flex-1 h-[calc(100vh-theme(space.16))]"> {/* Adjust height */}
      {/* Left Column: Book List */}
      <div className="w-2/3 pr-4 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Books</h2>
        {loading && <p className="text-gray-500">Loading books...</p>}
        {error && <p className="text-red-500">Error fetching books: {error}</p>}

        {!loading && !error && (
          <ul className="space-y-3">
            {books.length > 0 ? (
              books.map((book) => (
                <li key={book.id} className="bg-white p-4 rounded shadow hover:shadow-md transition-shadow">
                  <Link href={`/books/${book.id}`} className="text-blue-600 hover:underline">
                    <h3 className="text-lg font-semibold">{book.title} ({book.publicationYear})</h3>
                  </Link>
                  <p className="text-gray-600 text-sm">By: {book.author}</p>
                  {book.movies && book.movies.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Related Movies: {book.movies.length}
                    </p>
                  )}
                </li>
              ))
            ) : (
              <p className="text-gray-500">No books found.</p>
            )}
          </ul>
        )}
        {/* Add Book Button */}
        <div className="mt-6">
          <Link href="/books/add">
            <button className="px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700">
              Add New Book
            </button>
          </Link>
        </div>
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
