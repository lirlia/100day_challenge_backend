import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { gql } from 'graphql-tag'; // Or import from @apollo/server if preferred
import { PrismaClient, Prisma } from '@prisma/client'; // Correct import path
import { NextRequest } from 'next/server';
import { loadSchemaSync } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { join } from 'path';

const prisma = new PrismaClient();

// Remove the inline Type Definitions (Schema) as it's now loaded from the file
// const typeDefs = gql` ... `;

// Resolvers are defined inline below

// Resolvers
const resolvers = {
 Query: {
    movies: async (_: any, args: { titleContains?: string }) => {
      console.log('[Resolver: movies] Received args:', args); // Add log
      // Temporarily change type to any for debugging
      const whereCondition: any = {}; // Prisma.MovieWhereInput = {};
      if (args?.titleContains && args.titleContains.trim() !== '') {
        console.log('[Resolver: movies] Applying title filter:', args.titleContains); // Add log
        whereCondition.title = {
          contains: args.titleContains,
          mode: 'insensitive', // Add case-insensitive search like in books
        };
      }
      console.log('[Resolver: movies] Executing findMany with where:', whereCondition); // Add log
      try {
          const movies = await prisma.movie.findMany({
            where: whereCondition,
            // Restore include to fetch related books
            include: { books: true },
          });
          console.log(`[Resolver: movies] Found ${movies.length} movies.`); // Add log
          return movies;
      } catch (error) {
          console.error('[Resolver: movies] Error during prisma.movie.findMany:', error); // Add log
          throw new Error('Failed to fetch movies due to database error.'); // Throw specific error
      }
    },
    movie: async (_: any, args: { id: string }) => {
      console.log('[Resolver: movie] Received args:', args); // Add log
      try {
          const movie = await prisma.movie.findUnique({
            where: { id: parseInt(args.id, 10) },
            include: { books: true },
          });
          console.log('[Resolver: movie] Found movie:', movie ? movie.id : 'null'); // Add log
          return movie;
      } catch (error) {
          console.error(`[Resolver: movie] Error finding movie with id ${args.id}:`, error); // Add log
          throw new Error('Failed to fetch movie due to database error.');
      }
    },
    books: async (_: any, args: { titleContains?: string }) => {
      console.log('[Resolver: books] Received args:', args); // Add log for consistency
      // Use any type here as well if BookWhereInput has similar issues
      const whereCondition: any = {}; // Prisma.BookWhereInput = {};
      if (args?.titleContains && args.titleContains.trim() !== '') {
        console.log('[Resolver: books] Applying title filter:', args.titleContains); // Add log
        whereCondition.title = {
          contains: args.titleContains,
          mode: 'insensitive',
        };
      }
      try {
        return prisma.book.findMany({
          where: whereCondition,
          include: { movies: true },
        });
      } catch (dbError: any) {
          console.error("Database error fetching books:", dbError);
          throw new Error("Failed to fetch books from database.");
      }
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

// Load GraphQL schema from file
const typeDefsFromFile = loadSchemaSync(join(process.cwd(), 'app/api/graphql/schema.graphql'), {
  loaders: [new GraphQLFileLoader()],
});

// Create Apollo Server instance
const server = new ApolloServer<any>({
  typeDefs: typeDefsFromFile,
  resolvers,
});

// Create the Next.js handler
const handler = startServerAndCreateNextHandler(server, {
  // context: createContext,
});

// Export named exports for each HTTP method
export async function GET(request: NextRequest) {
  console.log('[/api/graphql] Received GET request'); // Add log
  return handler(request);
}

export async function POST(request: NextRequest) {
  console.log('[/api/graphql] Received POST request - Handler called'); // Modified log
  try {
    const response = await handler(request);
    console.log('[/api/graphql] Handler processed POST request successfully.'); // Add log
    return response;
  } catch (error) {
    console.error('[/api/graphql] Error processing POST request in handler:', error); // Modified log
    return new Response(JSON.stringify({ error: 'Internal Server Error during GraphQL handling' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
