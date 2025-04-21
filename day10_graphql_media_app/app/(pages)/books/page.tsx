"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import GraphQLViewer from '@/components/GraphQLViewer';

// Types matching GraphQL schema
interface MovieBasic {
  id: string;
  title: string;
}
interface Book {
  id: string;
  title: string;
  author: string;
  publicationYear: number;
  movies: MovieBasic[];
}
interface BooksResponse {
  data?: {
    books?: Book[];
  };
  errors?: { message: string }[];
}

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
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

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  // --- GraphQL Query Helper ---
  // (Assume executeGraphQL exists and works as before)
  const executeGraphQL = async <T,>(query: string, variables?: Record<string, any> | null): Promise<T> => {

    // --- Refined Dedent logic for display --- START
    const trimmedQuery = query.trim();
    const lines = trimmedQuery.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim() !== '');
    let dedentedQuery = trimmedQuery;

    if (nonEmptyLines.length > 0) {
      const minIndent = nonEmptyLines.reduce((min, line) => {
        const currentIndent = line.match(/^\s*/)![0].length;
        return Math.min(min, currentIndent);
      }, Infinity);

      if (minIndent > 0 && minIndent !== Infinity) {
        dedentedQuery = lines.map(line => line.slice(minIndent)).join('\n');
      }
    }
    // --- Refined Dedent logic for display --- END

    const operationType = dedentedQuery.startsWith('mutation') ? 'Mutation' : 'Query';
    let requestStringToDisplay = `${operationType}:\n${dedentedQuery}`; // Use dedented query
    if (variables) {
      requestStringToDisplay += `\nVariables: ${JSON.stringify(variables, null, 2)}`;
    }
    setGqlRequest(requestStringToDisplay);
    setGqlResponse(null);
    setGqlError(null);
    setError(null);

    setLoading(true);
    setError(null);

    // Construct the request body conditionally
    const bodyPayload: { query: string; variables?: Record<string, any> | null } = { query: trimmedQuery }; // Use trimmed query here too
    if (variables) { // Only add variables key if it's not null/undefined
      bodyPayload.variables = variables;
    }

    try {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload), // Send the conditionally constructed body
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

  // --- Fetch Books --- (Depends on debouncedSearchTerm)
  const fetchBooks = useCallback(async () => {
    setLoading(true);
    const query = `
      query GetBooksSimple {
        books {
          id
          title
          author
          publicationYear
        }
      }
    `;

    try {
      const result = await executeGraphQL<BooksResponse>(query);
      if (result.data?.books) {
        setBooks(result.data.books);
      } else {
        setBooks([]);
        console.log("No books found or returned from query.");
      }
    } catch (err) {
      setBooks([]); // Clear books on error
      console.error("Failed to fetch books:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);


  // --- Render Logic ---
  return (
    <div className="flex flex-1 h-[calc(100vh-theme(space.16))]">
      {/* Left Column: Book List & Add Button */}
      <div className="w-1/2 pr-4 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6">Books</h2>

        {/* Search Input */}
        <div className="mb-4">
          <input
            type="search"
            placeholder="Search books by title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
          />
        </div>

        {loading ? (
          <p className="text-gray-500">Loading books...</p>
        ) : error ? (
          <p className="text-red-500">Error: {error}</p>
        ) : books.length > 0 ? (
          <ul className="space-y-4">
            {books.map((book) => (
              <li key={book.id} className="bg-white p-4 rounded shadow hover:shadow-md transition-shadow">
                <Link href={`/books/${book.id}`}>
                  <h3 className="text-xl font-semibold text-green-600 hover:underline mb-1">{book.title} ({book.publicationYear})</h3>
                </Link>
                <p className="text-gray-600 text-sm mb-1">By: {book.author}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500">No books found{debouncedSearchTerm ? ` matching "${debouncedSearchTerm}"` : ''}.</p>
        )}

        {/* Add New Book Button */}
        <div className="mt-6">
          <Link href="/books/add">
            <button className="px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700">
              Add New Book
            </button>
          </Link>
        </div>
      </div>

      {/* Right Column: GraphQL Viewer */}
      <div className="w-1/2 pl-4 border-l border-gray-300 h-full">
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
