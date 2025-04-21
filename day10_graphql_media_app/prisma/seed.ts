import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding ...');

  // Clean up existing data
  await prisma.movie.deleteMany({});
  await prisma.book.deleteMany({});
  // Note: Implicit many-to-many relation table is managed by Prisma, no need to delete explicitly.

  // Seed Movies
  const movie1 = await prisma.movie.create({
    data: {
      title: 'インターステラー',
      director: 'クリストファー・ノーラン',
      releaseYear: 2014,
    },
  });

  const movie2 = await prisma.movie.create({
    data: {
      title: '君の名は。',
      director: '新海誠',
      releaseYear: 2016,
    },
  });

  const movie3 = await prisma.movie.create({
    data: {
      title: 'デューン 砂の惑星 PART1',
      director: 'ドゥニ・ヴィルヌーヴ',
      releaseYear: 2021,
    },
  });
  const movie4 = await prisma.movie.create({
    data: {
      title: 'ブレードランナー 2049',
      director: 'ドゥニ・ヴィルヌーヴ',
      releaseYear: 2017,
    },
  });


  // Seed Books
  const book1 = await prisma.book.create({
    data: {
      title: '君の名は。',
      author: '新海誠',
      publicationYear: 2016,
    },
  });

  const book2 = await prisma.book.create({
    data: {
      title: 'DUNE 上',
      author: 'フランク・ハーバート',
      publicationYear: 1965,
    },
  });
    const book3 = await prisma.book.create({
    data: {
      title: 'アンドロイドは電気羊の夢を見るか?',
      author: 'フィリップ・K・ディック',
      publicationYear: 1968,
    },
  });
    const book4 = await prisma.book.create({
    data: {
      title: '三体',
      author: '劉慈欣',
      publicationYear: 2008,
    },
  });

  // Relate Movies and Books
  await prisma.movie.update({
    where: { id: movie2.id },
    data: {
      books: {
        connect: { id: book1.id },
      },
    },
  });

  await prisma.movie.update({
    where: { id: movie3.id },
    data: {
      books: {
        connect: { id: book2.id },
      },
    },
  });

  await prisma.movie.update({
    where: { id: movie4.id },
    data: {
        books: {
            connect: { id: book3.id },
        }
    }
  })

  // You can also connect from the book side
  await prisma.book.update({
    where: { id: book1.id },
    data: {
      movies: {
        connect: { id: movie2.id }, // Already connected above, but demonstrating possibility
      },
    },
  });


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
