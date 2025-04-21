import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding ...');

  // Clean up existing data
  await prisma.movie.deleteMany({});
  await prisma.book.deleteMany({});
  // Note: Implicit many-to-many relation table is managed by Prisma, no need to delete explicitly.

  console.log('Creating initial movies and books...');

  // --- Initial Seed Data ---
  const initialMovies = [
    { title: 'インターステラー', director: 'クリストファー・ノーラン', releaseYear: 2014 },
    { title: '君の名は。', director: '新海誠', releaseYear: 2016 },
    { title: 'デューン 砂の惑星 PART1', director: 'ドゥニ・ヴィルヌーヴ', releaseYear: 2021 },
    { title: 'ブレードランナー 2049', director: 'ドゥニ・ヴィルヌーヴ', releaseYear: 2017 },
    // Add more initial/specific movies if needed
  ];

  const initialBooks = [
    { title: '君の名は。', author: '新海誠', publicationYear: 2016 },
    { title: 'DUNE 上', author: 'フランク・ハーバート', publicationYear: 1965 },
    { title: 'アンドロイドは電気羊の夢を見るか?', author: 'フィリップ・K・ディック', publicationYear: 1968 },
    { title: '三体', author: '劉慈欣', publicationYear: 2008 },
    // Add more initial/specific books if needed
  ];

  const createdMovies = [];
  for (const movieData of initialMovies) {
    const movie = await prisma.movie.create({ data: movieData });
    createdMovies.push(movie);
  }

  const createdBooks = [];
  for (const bookData of initialBooks) {
    const book = await prisma.book.create({ data: bookData });
    createdBooks.push(book);
  }

  // --- Add Dummy Data ---
  const targetCount = 30;
  const moviesToAddCount = targetCount - createdMovies.length;
  const booksToAddCount = targetCount - createdBooks.length;

  console.log(`Adding ${moviesToAddCount} dummy movies...`);
  for (let i = 1; i <= moviesToAddCount; i++) {
    await prisma.movie.create({
      data: {
        title: `ダミー映画 ${i}`,
        director: `ダミー監督 ${i}`,
        releaseYear: 2000 + i,
      },
    });
  }

  console.log(`Adding ${booksToAddCount} dummy books...`);
  for (let i = 1; i <= booksToAddCount; i++) {
    await prisma.book.create({
      data: {
        title: `ダミー書籍 ${i}`,
        author: `ダミー著者 ${i}`,
        publicationYear: 1990 + i,
      },
    });
  }

  // --- Relate Initial Movies and Books ---
  console.log('Relating initial movies and books...');

  // Relate 君の名は。
  const kimiNoNaWaMovie = createdMovies.find(m => m.title === '君の名は。');
  const kimiNoNaWaBook = createdBooks.find(b => b.title === '君の名は。');
  if (kimiNoNaWaMovie && kimiNoNaWaBook) {
    await prisma.movie.update({
      where: { id: kimiNoNaWaMovie.id },
      data: { books: { connect: { id: kimiNoNaWaBook.id } } },
    });
    // Also connect from book side for demonstration (optional, Prisma handles it)
    // await prisma.book.update({
    //   where: { id: kimiNoNaWaBook.id },
    //   data: { movies: { connect: { id: kimiNoNaWaMovie.id } } },
    // });
  }

  // Relate Dune
  const duneMovie = createdMovies.find(m => m.title === 'デューン 砂の惑星 PART1');
  const duneBook = createdBooks.find(b => b.title === 'DUNE 上');
  if (duneMovie && duneBook) {
    await prisma.movie.update({
      where: { id: duneMovie.id },
      data: { books: { connect: { id: duneBook.id } } },
    });
  }

  // Relate Blade Runner
  const bladeRunnerMovie = createdMovies.find(m => m.title === 'ブレードランナー 2049');
  const bladeRunnerBook = createdBooks.find(b => b.title === 'アンドロイドは電気羊の夢を見るか?');
  if (bladeRunnerMovie && bladeRunnerBook) {
    await prisma.movie.update({
      where: { id: bladeRunnerMovie.id },
      data: { books: { connect: { id: bladeRunnerBook.id } } },
    });
  }

  // Add more relations if needed

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
