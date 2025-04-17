import { PrismaClient } from '../app/generated/prisma';

const prisma = new PrismaClient();

// ユーザー名を生成するための簡単なリスト
const firstNames = ['佐藤', '鈴木', '高橋', '田中', '渡辺', '伊藤', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水'];
const lastNames = ['太郎', '花子', '一郎', '次郎', '三郎', '良子', '恵子', '明美', '直樹', '健太', '陽子', '真一', '美咲', '大輔', '彩', '翼', '遥', '翔太', '愛', '蓮'];

// ランダムなユーザー名を生成する関数
function generateRandomName(): string {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${firstName} ${lastName}`;
}

async function main() {
  console.log(`Start seeding ...`);

  // 既存のデータを削除
  console.log(`Deleting existing posts...`);
  await prisma.post.deleteMany({});
  console.log(`Deleting existing users...`);
  await prisma.user.deleteMany({});

  // ユーザーを30人作成
  const usersToCreate = 30;
  const createdUserNames = new Set<string>(); // 名前の重複を避ける

  console.log(`Creating ${usersToCreate} users...`);
  for (let i = 0; i < usersToCreate; i++) {
    let name = generateRandomName();
    // 重複しない名前が見つかるまで生成し直す (最大試行回数設定)
    let attempt = 0;
    while (createdUserNames.has(name) && attempt < 50) {
        name = generateRandomName();
        attempt++;
    }

    if(createdUserNames.has(name)) {
        console.warn(`Could not generate a unique name after ${attempt} attempts. Skipping user ${i + 1}.`);
        continue; // 50回試行しても重複する場合はスキップ
    }

    createdUserNames.add(name);
    const user = await prisma.user.create({
      data: { name },
    });
    console.log(`Created user with id: ${user.id}, name: ${user.name}`);
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
