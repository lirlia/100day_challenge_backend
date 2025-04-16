import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const names = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Ethan', 'Fiona', 'George', 'Hannah', 'Iori', 'Jun',
  'Kanon', 'Leo', 'Mio', 'Naoto', 'Otoha', 'Pico', 'Rina', 'Sota', 'Tomo', 'Umi',
  'Yui', 'Yuto', 'Saki', 'Haruto', 'Mizuki', 'Kaito', 'Riko', 'Shun', 'Yuna', 'Ren',
  'Hinata', 'Koharu', 'Sora', 'Riku', 'Akari', 'Yuma', 'Noa', 'Mei', 'Kou', 'Sara',
  'Ayumu', 'Rio', 'Miyu', 'Reo', 'Aoi', 'Kanon', 'Rin', 'Yuto', 'Mio', 'Sena',
  'Kanon', 'Yui', 'Haruki', 'Mio', 'Rina', 'Kota', 'Miyu', 'Sora', 'Yuto', 'Riko',
  'Kanon', 'Yuna', 'Hinata', 'Kou', 'Sara', 'Ayumu', 'Rio', 'Mei', 'Kou', 'Sara',
  'Ayumu', 'Rio', 'Miyu', 'Reo', 'Aoi', 'Kanon', 'Rin', 'Yuto', 'Mio', 'Sena',
  'Kanon', 'Yui', 'Haruki', 'Mio', 'Rina', 'Kota', 'Miyu', 'Sora', 'Yuto', 'Riko',
  'Kanon', 'Yuna', 'Hinata', 'Kou', 'Sara', 'Ayumu', 'Rio', 'Mei', 'Kou', 'Sara',
];
const bios = [
  '読書とカフェ巡りが好きです☕️',
  '週末はアクティブに過ごしたい派です！',
  'ゲームとアニメが好き🎮',
  '美味しいものを食べるのが幸せです🍷',
  '旅行が好きで、次はヨーロッパに行きたいです✈️',
  '猫とまったり過ごすのが好きです🐈',
  '音楽フェスによく行きます🎸',
  '美術館巡りが趣味です🎨',
  'スポーツ観戦が好きです⚽️',
  '映画と写真が趣味です📷',
];
const genders = ['female', 'male', 'other'];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  console.log(`Start seeding ...`);

  // Clear existing data
  await prisma.match.deleteMany();
  await prisma.swipe.deleteMany();
  await prisma.user.deleteMany();

  // 100人分のユーザーを作成
  const users = [];
  for (let i = 0; i < 100; i++) {
    const name = names[i % names.length] + (i + 1);
    const age = randomInt(18, 29);
    const gender = genders[i % genders.length];
    const bio = bios[i % bios.length];
    // Generate unique image URL for each user using Picsum Photos
    const profileImageUrl = `https://picsum.photos/seed/${i + 1}/400/400`;
    const user = await prisma.user.create({
      data: { name, age, gender, bio, profileImageUrl },
    });
    users.push(user);
  }
  console.log(`Created ${users.length} users.`);

  // 10組のマッチ済みペアを作成（user1Id < user2Id）
  for (let i = 0; i < 10; i++) {
    const user1 = users[i];
    const user2 = users[99 - i];
    // 先に両者がLikeし合ったSwipeを作成
    await prisma.swipe.create({
      data: { swiperUserId: user1.id, swipedUserId: user2.id, action: 'like' },
    });
    await prisma.swipe.create({
      data: { swiperUserId: user2.id, swipedUserId: user1.id, action: 'like' },
    });
    // Matchも作成
    await prisma.match.create({
      data: {
        user1Id: Math.min(user1.id, user2.id),
        user2Id: Math.max(user1.id, user2.id),
      },
    });
  }
  console.log('Created 10 matched pairs.');

  // 20件のSwipe（Like/Skip）を作成（マッチしない組み合わせ）
  for (let i = 0; i < 20; i++) {
    const swiper = users[randomInt(0, 99)];
    let swiped = users[randomInt(0, 99)];
    while (swiped.id === swiper.id) {
      swiped = users[randomInt(0, 99)];
    }
    const action = Math.random() < 0.5 ? 'like' : 'skip';
    // 既にマッチ済みの組み合わせは避ける
    if (Math.abs(swiper.id - swiped.id) > 10) {
      await prisma.swipe.create({
        data: { swiperUserId: swiper.id, swipedUserId: swiped.id, action },
      });
    }
  }
  console.log('Created 20 random swipes.');

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
