"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation'; // Import useParams
import GraphQLViewer from '@/components/GraphQLViewer';
import { toast } from 'react-hot-toast';

// Types matching GraphQL schema (could be refined or imported if generated)
interface BookBasic {
  id: string;
  title: string;
}
interface MovieDetails extends BookBasic { // Using BookBasic as a base for common fields like id, title
  director: string;
  releaseYear: number;
  books: BookBasic[];
}

// GraphQL Response Types
interface MovieDetailsResponse {
  data?: {
    movie?: MovieDetails;
  };
  errors?: { message: string }[];
}
interface BooksResponse {
  data?: {
    books?: BookBasic[];
  };
  errors?: { message: string }[];
}
interface MutationResponse { // Generic type for mutation responses
  data?: any;
  errors?: { message: string }[];
}


export default function MovieDetailPage() {
  const params = useParams(); // Get route parameters
  const router = useRouter();
  const movieId = params?.id as string | undefined; // Extract movie ID

  const [movie, setMovie] = useState<MovieDetails | null>(null);
  const [allBooks, setAllBooks] = useState<BookBasic[]>([]);
  const [selectedBookToRelate, setSelectedBookToRelate] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [gqlRequest, setGqlRequest] = useState<string | null>(null);
  const [gqlResponse, setGqlResponse] = useState<any | null>(null);
  const [gqlError, setGqlError] = useState<string | null>(null);

  // --- GraphQL Query/Mutation Helper ---
  const executeGraphQL = async <T,>(query: string, variables?: Record<string, any>, isPrimaryLog: boolean = true): Promise<T> => {

    // --- Simplified Display Logic --- START
    // Use the original query, just trimmed, for display. Remove complex dedent.
    const trimmedQuery = query.trim();
    // --- Simplified Display Logic --- END

    // Use the trimmed query for determining operation type and display
    const operationType = trimmedQuery.startsWith('mutation') ? 'Mutation' : 'Query';
    let requestStringToDisplay = `${operationType}:\n${trimmedQuery}`; // Use trimmed query directly
    if (variables) {
      requestStringToDisplay += `\nVariables: ${JSON.stringify(variables, null, 2)}`;
    }

    // Only update viewer state if it's the primary log source
    if (isPrimaryLog) {
      setGqlRequest(requestStringToDisplay);
      setGqlResponse(null);
      setGqlError(null);
    }
    setError(null); // Clear general error regardless of primary log status

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

      // Only update viewer state if it's the primary log source
      if (isPrimaryLog) {
        setGqlResponse(result); // Show full response regardless of GraphQL errors
      }

      if (result.errors) {
        console.error('GraphQL Errors:', result.errors);
        const errorMessages = result.errors.map((e: { message: string }) => e.message).join('\n');
        // Only update viewer state if it's the primary log source
        if (isPrimaryLog) {
          setGqlError(errorMessages);
        }
        setError(errorMessages); // Set general error regardless
        throw new Error(errorMessages); // Throw error to be caught by calling function
      }

      if (!result.data && !result.errors) { // Check for data only if no errors
        const errorMsg = 'No data returned from GraphQL query.';
        if (isPrimaryLog) {
          setGqlError(errorMsg);
        }
        setError(errorMsg); // Set general error regardless
        throw new Error(errorMsg);
      }


      return result; // Return full response structure

    } catch (err: any) {
      console.error('GraphQL Execution Error:', err);
      const errorMsg = err.message || 'An error occurred.';
      setError(errorMsg); // Set general error
      // Only update viewer state if it's the primary log source
      if (isPrimaryLog) {
        setGqlError(errorMsg); // Also set GqlError for display
      }
      throw err; // Re-throw to be caught by calling function if needed
    }
  };

  // --- Fetch Initial Data ---
  const fetchMovieAndBooks = useCallback(async () => {
    if (!movieId) return; // Don't fetch if ID is not available

    setLoading(true);
    // Reset general error, viewer state will be reset by the primary call
    setError(null);

    const movieQuery = `
      query GetMovie($id: ID!) {
        movie(id: $id) {
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
    const booksQuery = `
    query GetAllBooks {
      books {
      id
            title
            }
        }
    `;

    try {
      // Fetch movie details (primary log) and all books (not primary) in parallel
      const [movieResult, booksResult] = await Promise.all([
        // For GetMovie, isPrimaryLog is true (default or explicit)
        executeGraphQL<MovieDetailsResponse>(movieQuery, { id: movieId } /*, true */), // isPrimaryLog: true is default
        // For GetAllBooks, explicitly set isPrimaryLog to false
        executeGraphQL<BooksResponse>(booksQuery, undefined, false) // isPrimaryLog: false
      ]);

      // State updates based on results...
      if (movieResult.data?.movie) {
        setMovie(movieResult.data.movie);
      } else {
        // If movie fetch failed but wasn't caught below (e.g., data.movie is null)
        const movieErrorMsg = `Movie with ID ${movieId} not found.`;
        setError(movieErrorMsg);
        setGqlError(movieErrorMsg); // Update viewer error as this is the primary query context
        setMovie(null);
      }

      if (booksResult.data?.books) {
        setAllBooks(booksResult.data.books);
      } else {
        console.warn("Could not fetch the list of all books.");
        setAllBooks([]);
      }

    } catch (err: any) {
      // Error state (setError, setGqlError) should have been set
      // inside executeGraphQL for the failing primary query.
      // If the non-primary query failed, only setError would be set.
      // We still need to clear the component's data state.
      setMovie(null);
      setAllBooks([]);
      console.error("Failed to fetch initial data (error likely logged already by executeGraphQL):", err.message);
    } finally {
      setLoading(false);
    }
  }, [movieId]); // Re-run if movieId changes

  useEffect(() => {
    fetchMovieAndBooks();
  }, [fetchMovieAndBooks]); // Depend on the memoized fetch function


  // --- Handlers ---
  const handleDeleteMovie = async () => {
    if (!movieId || !movie) return;
    // Remove confirmation dialog

    const mutation = `
      mutation DeleteMovie($id: ID!) {
        deleteMovie(id: $id) {
          id # Request ID to confirm deletion
        }
      }
    `;
    try {
      // Manually set the request for the viewer before executing
      setGqlRequest(`mutation DeleteMovie($id: ID!) { deleteMovie(id: $id) { id } } Variables: ${JSON.stringify({ id: movieId }, null, 2)}`);
      await executeGraphQL<MutationResponse>(mutation, { id: movieId });
      toast.success('Movie deleted successfully!');
      router.push('/movies'); // Redirect after successful deletion
    } catch (err) {
      toast.error('Failed to delete movie.');
      // Error state is handled by executeGraphQL
    }
  };

  const handleRelateBook = async () => {
    if (!movieId || !selectedBookToRelate) return;

    const mutation = `
        mutation RelateMovieBook($movieId: ID!, $bookId: ID!) {
            relateMovieBook(movieId: $movieId, bookId: $bookId) {
                id # Refetch necessary fields, including the updated books list
                books {
                    id
                    title
                }
            }
        }
      `;
    try {
      // Manually set the request for the viewer
      setGqlRequest(`mutation RelateMovieBook($movieId: ID!, $bookId: ID!) { relateMovieBook(movieId: $movieId, bookId: $bookId) { id books { id title } } } Variables: ${JSON.stringify({ movieId: movieId, bookId: selectedBookToRelate }, null, 2)}`);
      await executeGraphQL<MutationResponse>(mutation, {
        movieId: movieId,
        bookId: selectedBookToRelate,
      });
      toast.success('Book related successfully!');
      setSelectedBookToRelate('');
      await fetchMovieAndBooks(); // Refetch data to update UI

    } catch (err) {
      toast.error('Failed to relate book.');
    }
  };

  const handleUnrelateBook = async (bookId: string, bookTitle: string) => {
    if (!movieId || !movie) return;
    // Remove confirmation dialog

    const mutation = `
        mutation UnrelateMovieBook($movieId: ID!, $bookId: ID!) {
            unrelateMovieBook(movieId: $movieId, bookId: $bookId) {
                id
                books {
                    id
                    title
                }
            }
        }
      `;
    try {
      // Manually set the request for the viewer
      setGqlRequest(`mutation UnrelateMovieBook($movieId: ID!, $bookId: ID!) { unrelateMovieBook(movieId: $movieId, bookId: $bookId) { id books { id title } } } Variables: ${JSON.stringify({ movieId: movieId, bookId: bookId }, null, 2)}`);
      await executeGraphQL<MutationResponse>(mutation, {
        movieId: movieId,
        bookId: bookId,
      });
      toast.success('Book unrelated successfully!');
      await fetchMovieAndBooks(); // Refetch data to update UI
    } catch (err) {
      toast.error('Failed to unrelate book.');
    }
  };

  // --- Render Logic ---
  if (loading) return <p className="p-6 text-gray-500">Loading movie details...</p>;
  // Show general errors prominently if movie data couldn't be loaded
  if (error && !movie) return <p className="p-6 text-red-500">Error: {error}</p>;
  if (!movie) return <p className="p-6 text-gray-500">Movie not found.</p>;


  // Filter books that are not already related
  const relatedBookIds = new Set(movie.books.map(b => b.id));
  const availableBooksToRelate = allBooks.filter(b => !relatedBookIds.has(b.id));

  return (
    <div className="flex flex-col md:flex-row flex-1 h-[calc(100vh-theme(space.16))]">
      {/* Left Column: Movie Details & Actions (Takes full width on small screens) */}
      <div className="w-full md:w-1/2 pr-0 md:pr-4 overflow-y-auto mb-4 md:mb-0">
        {/* General Error Display (e.g., for mutation errors) */}
        {error && <p className="mb-4 text-red-500 bg-red-100 p-3 rounded">Error: {error}</p>}

        {/* Movie Info */}
        <div className="bg-white p-6 rounded shadow-md mb-6">
          <h2 className="text-3xl font-bold mb-2">{movie.title}</h2>
          <p className="text-gray-700 mb-1"><span className="font-semibold">Director:</span> {movie.director}</p>
          <p className="text-gray-700 mb-4"><span className="font-semibold">Released:</span> {movie.releaseYear}</p>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            {/* TODO: Link to an edit page */}
            <Link href={`/movies/${movieId}/edit`}>
              <button className="px-4 py-2 bg-yellow-500 text-white rounded shadow hover:bg-yellow-600">
                Edit Movie
              </button>
            </Link>
            <button
              onClick={handleDeleteMovie}
              className="px-4 py-2 bg-red-600 text-white rounded shadow hover:bg-red-700"
            >
              Delete Movie
            </button>
          </div>
        </div>

        {/* Related Books Section */}
        <div className="bg-white p-6 rounded shadow-md mb-6">
          <h3 className="text-xl font-semibold mb-3">Related Books</h3>
          {movie.books.length > 0 ? (
            <ul className="space-y-2">
              {movie.books.map(book => (
                <li key={book.id} className="flex justify-between items-center border-b pb-2">
                  <Link href={`/books/${book.id}`} className="text-blue-600 hover:underline">
                    {book.title}
                  </Link>
                  <button
                    onClick={() => handleUnrelateBook(book.id, book.title)}
                    className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    Unrelate
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No related books.</p>
          )}
        </div>

        {/* Relate New Book Section */}
        <div className="bg-white p-6 rounded shadow-md">
          <h3 className="text-xl font-semibold mb-3">Relate a Book</h3>
          {availableBooksToRelate.length > 0 ? (
            <div className="flex items-center space-x-3">
              <select
                value={selectedBookToRelate}
                onChange={(e) => setSelectedBookToRelate(e.target.value)}
                className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="" disabled>Select a book to relate...</option>
                {availableBooksToRelate.map(book => (
                  <option key={book.id} value={book.id}>{book.title}</option>
                ))}
              </select>
              <button
                onClick={handleRelateBook}
                disabled={!selectedBookToRelate}
                className="px-4 py-2 bg-indigo-600 text-white rounded shadow hover:bg-indigo-700 disabled:opacity-50"
              >
                Relate Book
              </button>
            </div>
          ) : (
            <p className="text-gray-500">All available books are already related or no other books exist.</p>
          )}
        </div>

      </div>

      {/* Right Column: GraphQL Viewer (Takes full width on small screens) */}
      <div className="w-full md:w-1/2 pl-0 md:pl-4 border-t md:border-t-0 md:border-l border-gray-300 h-auto md:h-full">
        <div className="sticky top-0 h-full">
          <GraphQLViewer
            requestQuery={gqlRequest}
            responseJson={gqlResponse}
            error={gqlError} // Display only GraphQL-specific errors here
          />
        </div>
      </div>
    </div>
  );
}
