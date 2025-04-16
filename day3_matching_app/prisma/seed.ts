import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ランダムな要素を取得するヘルパー関数
const getRandomElement = <T>(array: T[]): T => {
  return array[Math.floor(Math.random() * array.length)];
};

// ランダムなアバター設定を生成する関数
const generateRandomAvatarData = (name: string) => {
  const avatarTypes = ['casual', 'business', 'sporty', 'artistic'];
  const skinColors = ['#F5D0A9', '#FFD1DC', '#D1BAA1', '#A67B5B', '#713F1D'];
  const hairColors = ['#4A2700', '#000000', '#DAA520', '#8B4513', '#CD853F', '#A52A2A', '#800000', '#FFD700'];
  const clothesColors = ['#3498DB', '#FF6B6B', '#2ECC71', '#F1C40F', '#9B59B6', '#1ABC9C'];
  const bgColors = ['#E6F3FF', '#FFF0F0', '#F0FFF0', '#FFF8E1', '#F3E5F5'];

  // 名前に基づいたカラーを生成
  const getColorFromName = (name: string): string => {
    const colors = [
      '#1ABC9C', '#2ECC71', '#3498DB', '#9B59B6', '#16A085',
      '#27AE60', '#2980B9', '#8E44AD', '#F1C40F', '#E67E22',
      '#E74C3C', '#D35400', '#C0392B', '#6D4C41', '#546E7A'
    ];

    let sum = 0;
    for (let i = 0; i < name.length; i++) {
      sum += name.charCodeAt(i);
    }

    return colors[sum % colors.length];
  };

  return {
    avatarType: getRandomElement(avatarTypes),
    skinColor: getRandomElement(skinColors),
    hairColor: getRandomElement(hairColors),
    clothesColor: getRandomElement(clothesColors),
    bgColor: getColorFromName(name)
  };
};

async function main() {
  console.log('Start seeding ...');

  // 既存のデータを削除 (本番では注意)
  await prisma.match.deleteMany({});
  await prisma.swipe.deleteMany({});
  await prisma.user.deleteMany({});

  const usersData = [
    { name: 'Alice Smith', age: 25, gender: 'female', bio: '旅行とカフェ巡りが好きです☕️✈️' },
    { name: 'Bob Johnson', age: 30, gender: 'male', bio: '週末はプログラミングしてます💻' },
    { name: 'Charlie Brown', age: 22, gender: 'male', bio: '音楽と映画が好き。気軽に話しましょう！' },
    { name: 'Diana Prince', age: 28, gender: 'female', bio: 'アクティブなことが好き！一緒に楽しみませんか？💪' },
    { name: 'Ethan Hunt', age: 35, gender: 'male', bio: '美味しいものを食べるのが生きがいです🍽️' },
    { name: 'Fiona Gallagher', age: 26, gender: 'female', bio: '読書とアートが好き。静かな時間を共有したいです📚🎨' },
    { name: 'George Costanza', age: 32, gender: 'male', bio: 'ユーモアのある人が好きです😄' },
    { name: 'Hannah Montana', age: 23, gender: 'female', bio: '歌うことと踊ることが大好き🎤💃' },
    { name: 'Ian Malcolm', age: 40, gender: 'male', bio: '知的な会話を楽しみたいです🤔' },
    { name: 'Julia Roberts', age: 29, gender: 'female', bio: '自然の中で過ごすのが好きです🌲☀️' },
  ];

  // 各ユーザーにアバターデータを設定
  const userData = usersData.map(user => {
    const avatarData = generateRandomAvatarData(user.name);
    return {
      ...user,
      profileImageUrl: null, // 既存のprofileImageUrlはnullに設定
      avatarType: avatarData.avatarType,
      skinColor: avatarData.skinColor,
      hairColor: avatarData.hairColor,
      clothesColor: avatarData.clothesColor,
      bgColor: avatarData.bgColor
    };
  });

  // ユーザーデータを挿入
  for (const user of userData) {
    await prisma.user.create({
      data: user
    });
  }

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
