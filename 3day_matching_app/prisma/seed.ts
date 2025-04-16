import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 簡単なSVGプレースホルダーを生成する関数
const createPlaceholderSvg = (name: string, size = 200) => {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('');
  const bgColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'); // ランダムな背景色
  const textColor = '#ffffff'; // 白文字

  return `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="${textColor}" font-size="${size * 0.4}" font-family="sans-serif" font-weight="bold">
    ${initials}
  </text>
</svg>
  `.trim();
};


async function main() {
  console.log('Start seeding ...');

  // 既存のデータを削除 (本番では注意)
  await prisma.match.deleteMany({});
  await prisma.swipe.deleteMany({});
  await prisma.user.deleteMany({});

  const usersData = [
    { name: 'Alice Smith', age: 25, gender: 'female', bio: '旅行とカフェ巡りが好きです☕️✈️', profileImageUrl: '' },
    { name: 'Bob Johnson', age: 30, gender: 'male', bio: '週末はプログラミングしてます💻', profileImageUrl: '' },
    { name: 'Charlie Brown', age: 22, gender: 'male', bio: '音楽と映画が好き。気軽に話しましょう！', profileImageUrl: '' },
    { name: 'Diana Prince', age: 28, gender: 'female', bio: 'アクティブなことが好き！一緒に楽しみませんか？💪', profileImageUrl: '' },
    { name: 'Ethan Hunt', age: 35, gender: 'male', bio: '美味しいものを食べるのが生きがいです🍽️', profileImageUrl: '' },
    { name: 'Fiona Gallagher', age: 26, gender: 'female', bio: '読書とアートが好き。静かな時間を共有したいです📚🎨', profileImageUrl: '' },
    { name: 'George Costanza', age: 32, gender: 'male', bio: 'ユーモアのある人が好きです😄', profileImageUrl: '' },
    { name: 'Hannah Montana', age: 23, gender: 'female', bio: '歌うことと踊ることが大好き🎤💃', profileImageUrl: '' },
    { name: 'Ian Malcolm', age: 40, gender: 'male', bio: '知的な会話を楽しみたいです🤔', profileImageUrl: '' },
    { name: 'Julia Roberts', age: 29, gender: 'female', bio: '自然の中で過ごすのが好きです🌲☀️', profileImageUrl: '' },
  ];

  // 各ユーザーにSVG画像を生成して設定
  for (const user of usersData) {
    user.profileImageUrl = `data:image/svg+xml;base64,${Buffer.from(createPlaceholderSvg(user.name)).toString('base64')}`;
  }

  // ユーザーデータを挿入
  await prisma.user.createMany({
    data: usersData,
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
