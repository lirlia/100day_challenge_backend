import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log(`Start seeding ...`);

  // Clean up existing data
  await prisma.comment.deleteMany({});
  await prisma.post.deleteMany({});
  await prisma.profile.deleteMany({});
  await prisma.user.deleteMany({});
  console.log('既存データを削除しました。');

  // ユーザーとプロフィールを作成
  const alice = await prisma.user.create({
    data: {
      email: 'alice@example.com',
      name: 'アリス',
      profile: {
        create: {
          bio: 'コードを書くのと猫が好きです。',
        },
      },
    },
    include: { profile: true },
  });

  const bob = await prisma.user.create({
    data: {
      email: 'bob@example.com',
      name: 'ボブ',
      profile: {
        create: {
          bio: 'ハイキングと写真撮影が好きです。',
        },
      },
    },
    include: { profile: true },
  });

  const charlie = await prisma.user.create({
    data: {
      email: 'charlie@example.com',
      name: 'チャーリー',
      // チャーリーは初期プロフィールなし
    },
  });

  console.log({ alice, bob, charlie });

  // 投稿を作成
  const post1 = await prisma.post.create({
    data: {
      title: 'アリスの最初の投稿',
      content: 'これは最初の投稿の内容です。',
      published: true,
      authorId: alice.id,
    },
  });

  const post2 = await prisma.post.create({
    data: {
      title: 'ボブの冒険',
      content: '山を探検中。',
      published: true,
      authorId: bob.id,
    },
  });

  const post3 = await prisma.post.create({
    data: {
      title: 'アリスの2番目の投稿',
      content: 'コーディングについてもう少し。',
      published: false,
      authorId: alice.id,
    },
  });

  console.log({ post1, post2, post3 });

  // コメントを作成
  const comment1 = await prisma.comment.create({
    data: {
      text: '素晴らしい投稿ですね、アリスさん！',
      postId: post1.id,
      authorId: bob.id,
    },
  });

  const comment2 = await prisma.comment.create({
    data: {
      text: '興味深い視点です。',
      postId: post1.id,
      authorId: charlie.id,
    },
  });

  const comment3 = await prisma.comment.create({
    data: {
      text: 'すごい写真！',
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
