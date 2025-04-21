"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import GraphQLViewer from '@/components/GraphQLViewer';
import { toast } from 'react-hot-toast';

// Types matching GraphQL schema
interface MovieBasic {
  id: string;
  title: string;
}
interface BookDetails extends MovieBasic { // Using MovieBasic as a base
  author: string;
  publicationYear: number;
  movies: MovieBasic[];
}

// GraphQL Response Types
interface BookDetailsResponse {
  data?: {
    book?: BookDetails;
  };
  errors?: { message: string }[];
}
interface MoviesResponse {
  data?: {
    movies?: MovieBasic[];
  };
  errors?: { message: string }[];
}
interface MutationResponse {
  data?: any;
  errors?: { message: string }[];
}


export default function BookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params?.id as string | undefined;

  const [book, setBook] = useState<BookDetails | null>(null);
  const [allMovies, setAllMovies] = useState<MovieBasic[]>([]);
  const [selectedMovieToRelate, setSelectedMovieToRelate] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [gqlRequest, setGqlRequest] = useState<string | null>(null);
  const [gqlResponse, setGqlResponse] = useState<any | null>(null);
  const [gqlError, setGqlError] = useState<string | null>(null);

  // --- GraphQL Query/Mutation Helper ---
  // Add optional isPrimaryLog flag
  const executeGraphQL = async <T,>(query: string, variables?: Record<string, any>, isPrimaryLog: boolean = true): Promise<T> => {

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
    // Only update viewer state if it's the primary log source
    if (isPrimaryLog) {
      setGqlRequest(requestStringToDisplay);
      setGqlResponse(null);
      setGqlError(null);
    }
    setError(null); // Clear general error regardless

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
        setGqlResponse(result);
      }

      if (result.errors) {
        console.error('GraphQL Errors:', result.errors);
        const errorMessages = result.errors.map((e: { message: string }) => e.message).join('\n');
        if (isPrimaryLog) {
          setGqlError(errorMessages);
        }
        setError(errorMessages);
        throw new Error(errorMessages);
      }
      if (!result.data && !result.errors) { // Check for data only if no errors
        const errorMsg = 'No data returned from GraphQL query.';
        if (isPrimaryLog) {
          setGqlError(errorMsg);
        }
        setError(errorMsg);
        throw new Error(errorMsg);
      }
      return result;

    } catch (err: any) {
      console.error('GraphQL Execution Error:', err);
      const errorMsg = err.message || 'An error occurred.';
      setError(errorMsg);
      if (isPrimaryLog) {
        setGqlError(errorMsg);
      }
      throw err;
    }
  };


  // --- Fetch Initial Data ---
  const fetchBookAndMovies = useCallback(async () => {
    if (!bookId) return;

    setLoading(true);
    setError(null);
    // Reset viewer state via the primary query call
    // setGqlError(null);
    // setGqlResponse(null);
    // setGqlRequest(null);


    const bookQuery = `
      query GetBook($id: ID!) {
        book(id: $id) {
          id
          title
          author
          publicationYear
          movies {
            id
            title
          }
        }
      }
    `;
    const moviesQuery = `
      query GetAllMovies {
        movies {
          id
          title
        }
      }
    `;

    try {
      // Fetch book details (primary) and all movies (not primary)
      const [bookResult, moviesResult] = await Promise.all([
        executeGraphQL<BookDetailsResponse>(bookQuery, { id: bookId } /*, true */), // isPrimaryLog: true is default
        executeGraphQL<MoviesResponse>(moviesQuery, undefined, false) // isPrimaryLog: false
      ]);

      if (bookResult.data?.book) {
        setBook(bookResult.data.book);
      } else {
        const bookErrorMsg = `Book with ID ${bookId} not found.`;
        setError(bookErrorMsg);
        setGqlError(bookErrorMsg); // Set viewer error as this is primary context
        setBook(null);
      }

      if (moviesResult.data?.movies) {
        setAllMovies(moviesResult.data.movies);
      } else {
        console.warn("Could not fetch the list of all movies.");
        setAllMovies([]);
      }

    } catch (err: any) {
      // Error state (setError, setGqlError for primary) handled in executeGraphQL
      setBook(null);
      setAllMovies([]);
      console.error("Failed to fetch initial data (error likely logged already):", err.message);
    } finally {
      setLoading(false);
    }
  }, [bookId]); // Dependency: bookId


  useEffect(() => {
    fetchBookAndMovies();
  }, [fetchBookAndMovies]);


  // --- Handlers ---
  const handleDeleteBook = async () => {
    if (!bookId || !book) return;
    // Remove confirmation dialog

    const mutation = `
      mutation DeleteBook($id: ID!) {
        deleteBook(id: $id) {
          id
        }
      }
    `;
    try {
      // Manually set the request for the viewer
      setGqlRequest(`mutation DeleteBook($id: ID!) { deleteBook(id: $id) { id } } Variables: ${JSON.stringify({ id: bookId }, null, 2)}`);
      await executeGraphQL<MutationResponse>(mutation, { id: bookId });
      // alert('Book deleted successfully!');
      toast.success('Book deleted successfully!');
      // Remove automatic redirection
      // router.push('/books');
    } catch (err) {
      // alert('Failed to delete book.');
      toast.error('Failed to delete book.');
    }
  };

  // Note: Relating is done from the Movie side in our API (relateMovieBook).
  // We need to call the *same* mutation, just providing the current bookId
  // and the selected movieId. The response will be the updated Movie object.
  const handleRelateMovie = async () => {
    if (!bookId || !selectedMovieToRelate) return;

    // We use relateMovieBook, providing the selected movie ID and current book ID
    const mutation = `
        mutation RelateMovieBook($movieId: ID!, $bookId: ID!) {
            relateMovieBook(movieId: $movieId, bookId: $bookId) {
                id # Only need ID to confirm success
                # books { # We don't need the movie's book list here
                #      id
                #      title
                #  }
            }
        }
      `;
    try {
      // Find the movie title from allMovies for potential use in state update
      const movieToRelate = allMovies.find(m => m.id === selectedMovieToRelate);

      // Let executeGraphQL handle setting the request log
      // Remove manual setGqlRequest: setGqlRequest(`mutation RelateMovieBook...`);
      const result = await executeGraphQL<MutationResponse>(mutation, {
        movieId: selectedMovieToRelate,
        bookId: bookId,
      });

      if (result.data?.relateMovieBook) {
        toast.success('Movie related successfully!');
        setSelectedMovieToRelate('');
        // Manually update the book state's movies array
        if (movieToRelate) {
          setBook(prevBook => prevBook ? {
            ...prevBook,
            movies: [...prevBook.movies, { id: movieToRelate.id, title: movieToRelate.title }]
          } : null);
        } else {
          // If movie details weren't available, just refetch as a fallback
          console.warn("Could not find movie details locally to update UI, refetching book.");
          fetchBookAndMovies(); // Fallback refetch
        }
      } else {
        toast.error('Failed to relate movie: No data returned.');
      }
      // Remove refetch: await fetchBookAndMovies();

    } catch (err) {
      // toast.error('Failed to relate movie.');
      console.error("Relate movie error:", err)
    }
  };

  // Similar logic for unrelating: call the *same* mutation from the movie side.
  const handleUnrelateMovie = async (movieId: string, movieTitle: string) => {
    if (!bookId || !book) return;
    // Remove confirmation dialog

    // Use unrelateMovieBook mutation
    const mutation = `
        mutation UnrelateMovieBook($movieId: ID!, $bookId: ID!) {
            unrelateMovieBook(movieId: $movieId, bookId: $bookId) {
                id # Only need ID to confirm success
                # books { # We don't need the movie's book list here
                #      id
                #      title
                #  }
            }
        }
      `;
    try {
      // Let executeGraphQL handle setting the request log
      // Remove manual setGqlRequest: setGqlRequest(`mutation UnrelateMovieBook...`);
      const result = await executeGraphQL<MutationResponse>(mutation, {
        movieId: movieId,
        bookId: bookId,
      });

      if (result.data?.unrelateMovieBook) {
        toast.success('Movie unrelated successfully!');
        // Manually update the book state's movies array
        setBook(prevBook => prevBook ? {
          ...prevBook,
          movies: prevBook.movies.filter(m => m.id !== movieId)
        } : null);
      } else {
        toast.error('Failed to unrelate movie: No data returned.');
      }
      // Remove refetch: await fetchBookAndMovies();
    } catch (err) {
      // toast.error('Failed to unrelate movie.');
      console.error("Unrelate movie error:", err)
    }
  };


  // --- Render Logic ---
  if (loading) return <p className="p-6 text-gray-500">Loading book details...</p>;
  if (error && !book) return <p className="p-6 text-red-500">Error: {error}</p>;
  if (!book) return <p className="p-6 text-gray-500">Book not found.</p>;

  const relatedMovieIds = new Set(book.movies.map(m => m.id));
  const availableMoviesToRelate = allMovies.filter(m => !relatedMovieIds.has(m.id));

  return (
    <div className="flex flex-col md:flex-row flex-1 h-[calc(100vh-theme(space.16))]">
      {/* Left Column: Book Details & Actions (Takes full width on small screens) */}
      <div className="w-full md:w-1/2 pr-0 md:pr-4 overflow-y-auto mb-4 md:mb-0">
        {error && <p className="mb-4 text-red-500 bg-red-100 p-3 rounded">Error: {error}</p>}

        {/* Book Info */}
        <div className="bg-white p-6 rounded shadow-md mb-6">
          <h2 className="text-3xl font-bold mb-2">{book.title}</h2>
          <p className="text-gray-700 mb-1"><span className="font-semibold">Author:</span> {book.author}</p>
          <p className="text-gray-700 mb-4"><span className="font-semibold">Published:</span> {book.publicationYear}</p>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            {/* TODO: Link to an edit page */}
            <Link href={`/books/${bookId}/edit`}>
              <button className="px-4 py-2 bg-yellow-500 text-white rounded shadow hover:bg-yellow-600">
                Edit Book
              </button>
            </Link>
            <button
              onClick={handleDeleteBook}
              className="px-4 py-2 bg-red-600 text-white rounded shadow hover:bg-red-700"
            >
              Delete Book
            </button>
          </div>
        </div>

        {/* Related Movies Section */}
        <div className="bg-white p-6 rounded shadow-md mb-6">
          <h3 className="text-xl font-semibold mb-3">Related Movies</h3>
          {book.movies.length > 0 ? (
            <ul className="space-y-2">
              {book.movies.map(movie => (
                <li key={movie.id} className="flex justify-between items-center border-b pb-2">
                  <Link href={`/movies/${movie.id}`} className="text-blue-600 hover:underline">
                    {movie.title}
                  </Link>
                  <button
                    onClick={() => handleUnrelateMovie(movie.id, movie.title)}
                    className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    Unrelate
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No related movies.</p>
          )}
        </div>

        {/* Relate New Movie Section */}
        <div className="bg-white p-6 rounded shadow-md">
          <h3 className="text-xl font-semibold mb-3">Relate a Movie</h3>
          {availableMoviesToRelate.length > 0 ? (
            <div className="flex items-center space-x-3">
              <select
                value={selectedMovieToRelate}
                onChange={(e) => setSelectedMovieToRelate(e.target.value)}
                className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
              >
                <option value="" disabled>Select a movie to relate...</option>
                {availableMoviesToRelate.map(movie => (
                  <option key={movie.id} value={movie.id}>{movie.title}</option>
                ))}
              </select>
              <button
                onClick={handleRelateMovie}
                disabled={!selectedMovieToRelate}
                className="px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700 disabled:opacity-50"
              >
                Relate Movie
              </button>
            </div>
          ) : (
            <p className="text-gray-500">All available movies are already related or no other movies exist.</p>
          )}
        </div>

      </div>

      {/* Right Column: GraphQL Viewer (Takes full width on small screens) */}
      <div className="w-full md:w-1/2 pl-0 md:pl-4 border-t md:border-t-0 md:border-l border-gray-300 h-auto md:h-full">
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
