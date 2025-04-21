import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { gql } from 'graphql-tag'; // Or import from @apollo/server if preferred
import { PrismaClient, Prisma } from '@prisma/client'; // Correct import path

const prisma = new PrismaClient();

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
    movies: async (_: any, args: { titleContains?: string }) => {
      const whereCondition: Prisma.MovieWhereInput = {};
      if (args.titleContains && args.titleContains.trim() !== '') {
        whereCondition.title = {
          contains: args.titleContains,
        };
      }
      return prisma.movie.findMany({
        where: whereCondition,
        include: { books: true }, // Include related books
      });
    },
    movie: async (_: any, args: { id: string }) => {
      return prisma.movie.findUnique({
        where: { id: parseInt(args.id, 10) },
        // Include related books when fetching a single movie
        include: { books: true },
      });
    },
    books: async (_: any, args: { titleContains?: string }) => {
      const whereCondition: Prisma.BookWhereInput = {};
      if (args.titleContains && args.titleContains.trim() !== '') {
        whereCondition.title = {
          contains: args.titleContains,
        };
      }
      return prisma.book.findMany({
        where: whereCondition,
        include: { movies: true },
      });
    },
    book: async (_: any, args: { id: string }) => {
      return prisma.book.findUnique({
        where: { id: parseInt(args.id, 10) },
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
      return prisma.movie.create({
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
          const movie = prisma.movie.findUnique({ where: { id: parseInt(id, 10) }});
          return movie ? movie : null;
      }

      try {
         return prisma.movie.update({
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
            const deletedMovie = prisma.movie.delete({
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
      return prisma.book.create({
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
             const book = prisma.book.findUnique({ where: { id: parseInt(id, 10) }});
             return book ? book : null;
         }

        try {
            return prisma.book.update({
                where: { id: parseInt(id, 10) },
                data: dataToUpdate,
            });
        } catch (error: any) {
             if (error.code === 'P2025') {
                console.error(`Book with id ${id} not found for update.`);
                // Return null or throw a specific error based on API design
                return null;
            }
            console.error(`Error updating book with id ${id}:`, error);
            throw new Error('Failed to update book');
        }
    },
    deleteBook: async (_: any, { id }: { id: string }) => {
         try {
            const deletedBook = prisma.book.delete({
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
            return prisma.movie.update({
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
             throw new Error('Failed to relate movie and book');
        }
    },
    unrelateMovieBook: async (
      _: any,
      { movieId, bookId }: { movieId: string; bookId: string }
    ) => {
        try {
            return prisma.movie.update({
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
  }, // End of Mutation resolvers
}; // End of resolvers object


// Create Apollo Server instance
const server = new ApolloServer({
  typeDefs,
  resolvers,
});

// Create Next.js handler
const handler = startServerAndCreateNextHandler(server, {
    // context: async (req, res) => ({ req, res }), // Add context if needed
});

// Export the handler for GET and POST requests
export { handler as GET, handler as POST };
