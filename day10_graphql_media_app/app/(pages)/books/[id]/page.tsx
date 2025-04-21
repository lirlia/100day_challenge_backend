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
  // (Reusing the same helper logic as MovieDetailPage for consistency)
  const executeGraphQL = async <T,>(query: string, variables?: Record<string, any>): Promise<T> => {
    // Determine if it's a mutation or query for display purposes
    const operationType = query.trim().startsWith('mutation') ? 'Mutation' : 'Query';
    let requestStringToDisplay = `${operationType}:\n${query}`;
    if (variables) {
      requestStringToDisplay += `\nVariables: ${JSON.stringify(variables, null, 2)}`;
    }
    setGqlRequest(requestStringToDisplay);
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
        throw new Error('No data returned from GraphQL query.');
      }
      return result;

    } catch (err: any) {
      console.error('GraphQL Execution Error:', err);
      setError(err.message || 'An error occurred.');
      setGqlError(err.message || 'An error occurred.');
      throw err;
    }
  };


  // --- Fetch Initial Data ---
  const fetchBookAndMovies = useCallback(async () => {
    if (!bookId) return;

    setLoading(true);
    setError(null);
    setGqlError(null);
    setGqlResponse(null);
    setGqlRequest(null);


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
      const [bookResult, moviesResult] = await Promise.all([
        executeGraphQL<BookDetailsResponse>(bookQuery, { id: bookId }),
        executeGraphQL<MoviesResponse>(moviesQuery)
      ]);

      if (bookResult.data?.book) {
        setBook(bookResult.data.book);
      } else {
        setError(`Book with ID ${bookId} not found.`);
        setBook(null);
      }

      if (moviesResult.data?.movies) {
        setAllMovies(moviesResult.data.movies);
      } else {
        console.warn("Could not fetch the list of all movies.");
        setAllMovies([]);
      }

    } catch (err) {
      setBook(null);
      setAllMovies([]);
      console.error("Failed to fetch initial data:", err);
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
      router.push('/books');
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
                id # We get back the movie ID
                 books { # And the movie's updated book list
                      id
                      title
                  }
            }
        }
      `;
    try {
      // We don't get the updated Book object back directly from this mutation.
      // To reflect the change, we refetch the book details.
      // Manually set the request for the viewer
      setGqlRequest(`mutation RelateMovieBook($movieId: ID!, $bookId: ID!) { relateMovieBook(movieId: $movieId, bookId: $bookId) { id books { id title } } } Variables: ${JSON.stringify({ movieId: selectedMovieToRelate, bookId: bookId }, null, 2)}`);
      await executeGraphQL<MutationResponse>(mutation, {
        movieId: selectedMovieToRelate,
        bookId: bookId,
      });
      // alert('Movie related successfully!');
      toast.success('Movie related successfully!');
      setSelectedMovieToRelate('');
      // Refetch book details to show the updated related movies list
      await fetchBookAndMovies();

    } catch (err) {
      // alert('Failed to relate movie.');
      toast.error('Failed to relate movie.');
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
                id # Movie ID
                 books { # Updated book list for the movie
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
      // alert('Movie unrelated successfully!');
      toast.success('Movie unrelated successfully!');
      // Refetch book details to update the UI
      await fetchBookAndMovies();
    } catch (err) {
      // alert('Failed to unrelate movie.');
      toast.error('Failed to unrelate movie.');
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
      <div className="w-full md:w-2/3 pr-0 md:pr-4 overflow-y-auto mb-4 md:mb-0">
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
      <div className="w-full md:w-1/3 pl-0 md:pl-4 border-t md:border-t-0 md:border-l border-gray-300 h-auto md:h-full">
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
