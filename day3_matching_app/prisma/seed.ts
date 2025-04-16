import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log(`Start seeding ...`);

  // Clear existing data
  await prisma.match.deleteMany();
  await prisma.swipe.deleteMany();
  await prisma.user.deleteMany();

  const usersData = [
    {
      name: 'Alice',
      age: 25,
      gender: 'female',
      bio: '読書とカフェ巡りが好きです☕️',
      profileImageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'Bob',
      age: 28,
      gender: 'male',
      bio: '週末はアクティブに過ごしたい派です！',
      profileImageUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'Charlie',
      age: 22,
      gender: 'male',
      bio: 'ゲームとアニメが好き🎮',
      profileImageUrl: 'https://images.unsplash.com/photo-1521119989659-a83eee488004?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'Diana',
      age: 30,
      gender: 'female',
      bio: '美味しいものを食べるのが幸せです🍷',
      profileImageUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'Ethan',
      age: 26,
      gender: 'male',
      bio: '旅行が好きで、次はヨーロッパに行きたいです✈️',
      profileImageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'Fiona',
      age: 24,
      gender: 'female',
      bio: '猫とまったり過ごすのが好きです🐈',
      profileImageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=400&auto=format&fit=crop',
    },
    {
        name: 'George',
        age: 29,
        gender: 'male',
        bio: '音楽フェスによく行きます🎸',
        profileImageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop',
    },
    {
        name: 'Hannah',
        age: 27,
        gender: 'female',
        bio: '美術館巡りが趣味です🎨',
        profileImageUrl: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?q=80&w=400&auto=format&fit=crop',
    }
  ];

  for (const u of usersData) {
    const user = await prisma.user.create({
      data: u,
    });
    console.log(`Created user with id: ${user.id}`);
  }

  console.log(`Seeding finished.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
