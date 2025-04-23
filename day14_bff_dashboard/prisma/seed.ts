import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ユーザーの初期データ
  const user1 = await prisma.user.create({
    data: {
      name: 'User One',
      email: 'user1@example.com',
      bio: 'This is user one.',
    },
  });

  const user2 = await prisma.user.create({
    data: {
      name: 'User Two',
      email: 'user2@example.com',
      bio: 'This is user two.',
    },
  });

  // アクティビティの初期データ
  await prisma.activity.createMany({
    data: [
      { userId: user1.id, action: '記事 A を読んだ' },
      { userId: user1.id, action: '商品 B を購入した' },
      { userId: user2.id, action: '記事 C を読んだ' },
      { userId: user2.id, action: '商品 D を購入した' },
    ],
  });

  // お知らせの初期データ
  await prisma.notification.createMany({
    data: [
      { title: 'お知らせ1', content: 'これはお知らせ1です。' },
      { title: 'お知らせ2', content: 'これはお知らせ2です。' },
      { title: 'お知らせ3', content: 'これはお知らせ3です。' },
    ],
  });

  // おすすめの初期データ
  await prisma.recommendation.createMany({
    data: [
      { itemName: 'おすすめ商品A', imageUrl: 'https://picsum.photos/200', description: 'これはおすすめ商品Aです。', targetUserType: 'even' },
      { itemName: 'おすすめ商品B', imageUrl: 'https://picsum.photos/200', description: 'これはおすすめ商品Bです。', targetUserType: 'odd' },
    ],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
