import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { gql } from 'graphql-tag'; // Or import from @apollo/server if preferred
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client'; // Prisma Namespace をインポート

// Type Definitions (Schema)
const typeDefs = gql`
  # Scalars representing date/time, replace with custom scalar if precise handling is needed
  scalar DateTime

  type Movie {
    id: ID!
    title: String!
    director: String!
    releaseYear: Int!
    books: [Book!] # Related books
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Book {
    id: ID!
    title: String!
    author: String!
    publicationYear: Int!
    movies: [Movie!] # Related movies
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Query {
    movies: [Movie!]!
    movie(id: ID!): Movie
    books: [Book!]!
    book(id: ID!): Book
  }

   input MovieUpdateInput {
       title: String
       director: String
       releaseYear: Int
   }

   input BookUpdateInput {
      title: String
      author: String
      publicationYear: Int
   }


  type Mutation {
    addMovie(title: String!, director: String!, releaseYear: Int!): Movie!
    updateMovie(id: ID!, input: MovieUpdateInput): Movie
    deleteMovie(id: ID!): Movie

    addBook(title: String!, author: String!, publicationYear: Int!): Book!
    updateBook(id: ID!, input: BookUpdateInput): Book
    deleteBook(id: ID!): Book

    relateMovieBook(movieId: ID!, bookId: ID!): Movie
    unrelateMovieBook(movieId: ID!, bookId: ID!): Movie
  }
`;

// Resolvers
const resolvers = {
 Query: {
    movies: async () => {
        // Include related books when fetching movies
      return await prisma.movie.findMany({ include: { books: true } });
    },
    movie: async (_: any, { id }: { id: string }) => {
      return await prisma.movie.findUnique({
        where: { id: parseInt(id, 10) },
        // Include related books when fetching a single movie
        include: { books: true },
      });
    },
    books: async () => {
        // Include related movies when fetching books
      return await prisma.book.findMany({ include: { movies: true } });
    },
    book: async (_: any, { id }: { id: string }) => {
      return await prisma.book.findUnique({
        where: { id: parseInt(id, 10) },
        // Include related movies when fetching a single book
        include: { movies: true },
      });
    },
  },
  Mutation: {
     addMovie: async (
      _: any,
      { title, director, releaseYear }: { title: string; director: string; releaseYear: number } // Basic types
    ) => {
      return await prisma.movie.create({
        data: { title, director, releaseYear },
      });
    },
     updateMovie: async (
      _: any,
      { id, input }: { id: string; input: { title?: string; director?: string; releaseYear?: number } } // Basic types for input
    ) => {

      // Construct dataToUpdate directly
      const dataToUpdate: { title?: string; director?: string; releaseYear?: number } = {};
      if (input.title !== undefined && input.title !== null) dataToUpdate.title = input.title;
      if (input.director !== undefined && input.director !== null) dataToUpdate.director = input.director;
      if (input.releaseYear !== undefined && input.releaseYear !== null) dataToUpdate.releaseYear = input.releaseYear;

      if (Object.keys(dataToUpdate).length === 0) {
          console.warn(`UpdateMovie called for id ${id} with no fields to update.`);
          // Return type needs to match the Promise signature
          const movie = await prisma.movie.findUnique({ where: { id: parseInt(id, 10) }});
          return movie ? movie : null;
      }

      try {
         return await prisma.movie.update({
            where: { id: parseInt(id, 10) },
            data: dataToUpdate,
          });
      } catch (error: any) {
           // Handle specific Prisma errors like record not found (P2025)
           if (error.code === 'P2025') {
                console.error(`Movie with id ${id} not found for update.`);
                return null; // Or throw a more specific GraphQL error
           }
           console.error(`Error updating movie with id ${id}:`, error);
           throw new Error('Failed to update movie'); // Generic error
      }
    },
    deleteMovie: async (_: any, { id }: { id: string }) => {
        try {
            // Return the deleted movie data
            const deletedMovie = await prisma.movie.delete({
                where: { id: parseInt(id, 10) },
            });
            return deletedMovie;
        } catch (error: any) {
             if (error.code === 'P2025') {
                console.warn(`Movie with id ${id} not found for deletion.`);
                return null; // Indicate movie was not found
            }
            console.error(`Error deleting movie with id ${id}:`, error);
             // Throw a GraphQL-friendly error or return null based on desired API behavior
            throw new Error('Failed to delete movie');
        }
    },
     addBook: async (
      _: any,
      { title, author, publicationYear }: { title: string; author: string; publicationYear: number } // Basic types
    ) => {
      return await prisma.book.create({
        data: { title, author, publicationYear },
      });
    },
    updateBook: async (
      _: any,
      { id, input }: { id: string; input: { title?: string; author?: string; publicationYear?: number } } // Basic types for input
    ) => {
        // Construct dataToUpdate directly
        const dataToUpdate: { title?: string; author?: string; publicationYear?: number } = {};
        if (input.title !== undefined && input.title !== null) dataToUpdate.title = input.title;
        if (input.author !== undefined && input.author !== null) dataToUpdate.author = input.author;
        if (input.publicationYear !== undefined && input.publicationYear !== null) dataToUpdate.publicationYear = input.publicationYear;

         if (Object.keys(dataToUpdate).length === 0) {
             console.warn(`UpdateBook called for id ${id} with no fields to update.`);
             const book = await prisma.book.findUnique({ where: { id: parseInt(id, 10) }});
             return book ? book : null;
         }

        try {
            return await prisma.book.update({
                where: { id: parseInt(id, 10) },
                data: dataToUpdate,
            });
        } catch (error: any) {
             if (error.code === 'P2025') {
                console.error(`Book with id ${id} not found for update.`);
                return null;
           }
            console.error(`Error updating book with id ${id}:`, error);
            throw new Error('Failed to update book');
        }
    },
     deleteBook: async (_: any, { id }: { id: string }) => {
         try {
            const deletedBook = await prisma.book.delete({
                where: { id: parseInt(id, 10) },
            });
            return deletedBook;
        } catch (error: any) {
            if (error.code === 'P2025') {
                console.warn(`Book with id ${id} not found for deletion.`);
                return null;
            }
            console.error(`Error deleting book with id ${id}:`, error);
            throw new Error('Failed to delete book');
        }
    },
    relateMovieBook: async (
      _: any,
      { movieId, bookId }: { movieId: string; bookId: string }
    ) => {
        try {
            return await prisma.movie.update({
                where: { id: parseInt(movieId, 10) },
                data: {
                    books: {
                        connect: { id: parseInt(bookId, 10) },
                    },
                },
                include: { books: true }, // Include related books in the response
            });
        } catch (error) {
            console.error(`Error relating movie ${movieId} and book ${bookId}:`, error);
            // Could return null or throw a more specific error based on the cause
             throw new Error('Failed to relate movie and book');
        }
    },
    unrelateMovieBook: async (
      _: any,
      { movieId, bookId }: { movieId: string; bookId: string }
    ) => {
        try {
            return await prisma.movie.update({
                where: { id: parseInt(movieId, 10) },
                data: {
                    books: {
                        disconnect: { id: parseInt(bookId, 10) },
                    },
                },
                include: { books: true }, // Include related books in the response
            });
        } catch (error) {
             console.error(`Error unrelating movie ${movieId} and book ${bookId}:`, error);
              throw new Error('Failed to unrelate movie and book');
        }
    },
  },
  // Prisma typically handles resolving scalar fields automatically.
  // Explicit resolvers for relations (Movie.books, Book.movies) are usually
  // only needed if you want custom logic beyond what `include` provides.
  // Since we are using `include` in the parent resolvers (Query.movies, Query.movie, etc.),
  // these explicit resolvers are generally not necessary here.

  // Example if explicit resolvers were needed:
  // Movie: {
  //   books: async (parent: Movie): Promise<Book[]> => {
  //     // This would fetch books related to the parent movie
  //     // Note: This might lead to N+1 query problems if not handled carefully.
  //     // Using `include` in the parent resolver is often more efficient.
  //     return await prisma.movie.findUnique({ where: { id: parent.id } }).books() ?? [];
  //   },
  // },
  // Book: {
  //   movies: async (parent: Book): Promise<Movie[]> => {
  //     return await prisma.book.findUnique({ where: { id: parent.id } }).movies() ?? [];
  //   },
  // },
};


// Create Apollo Server instance
const server = new ApolloServer({
  typeDefs,
  resolvers,
});

// Create Next.js handler
// We need variable assignment for correct type inference with startServerAndCreateNextHandler
const handler = startServerAndCreateNextHandler(server, {
    // context: async (req, res) => ({ req, res }), // Add context if needed
});

// Export the handler for GET and POST requests
export { handler as GET, handler as POST };
