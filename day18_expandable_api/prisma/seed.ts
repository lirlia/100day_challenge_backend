import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log(`Start seeding ...`);

  // Clean up existing data
  await prisma.comment.deleteMany({});
  await prisma.post.deleteMany({});
  await prisma.profile.deleteMany({});
  await prisma.user.deleteMany({});
  console.log('Deleted existing data.');

  // Create Users and Profiles
  const alice = await prisma.user.create({
    data: {
      email: 'alice@example.com',
      name: 'Alice',
      profile: {
        create: {
          bio: 'Loves coding and cats.',
        },
      },
    },
    include: { profile: true },
  });

  const bob = await prisma.user.create({
    data: {
      email: 'bob@example.com',
      name: 'Bob',
      profile: {
        create: {
          bio: 'Enjoys hiking and photography.',
        },
      },
    },
    include: { profile: true },
  });

  const charlie = await prisma.user.create({
    data: {
      email: 'charlie@example.com',
      name: 'Charlie',
      // Charlie has no profile initially
    },
  });

  console.log({ alice, bob, charlie });

  // Create Posts
  const post1 = await prisma.post.create({
    data: {
      title: 'First Post by Alice',
      content: 'This is the content of the first post.',
      published: true,
      authorId: alice.id,
    },
  });

  const post2 = await prisma.post.create({
    data: {
      title: "Bob's Adventure",
      content: 'Exploring the mountains.',
      published: true,
      authorId: bob.id,
    },
  });

  const post3 = await prisma.post.create({
    data: {
      title: "Alice's Second Post",
      content: 'More thoughts on coding.',
      published: false,
      authorId: alice.id,
    },
  });

  console.log({ post1, post2, post3 });

  // Create Comments
  const comment1 = await prisma.comment.create({
    data: {
      text: 'Great post, Alice!',
      postId: post1.id,
      authorId: bob.id,
    },
  });

  const comment2 = await prisma.comment.create({
    data: {
      text: 'Interesting perspective.',
      postId: post1.id,
      authorId: charlie.id,
    },
  });

  const comment3 = await prisma.comment.create({
    data: {
      text: 'Amazing photos!',
      postId: post2.id,
      authorId: alice.id,
    },
  });

  console.log({ comment1, comment2, comment3 });

  console.log(`Seeding finished.`);
}

main()
  .catch(async (e: Error) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
