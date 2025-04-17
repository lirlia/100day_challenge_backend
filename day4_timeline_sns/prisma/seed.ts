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

// --- 絵文字生成ロジック (app/page.tsx からコピー) ---
const userEmojiList = ['🐶', '🐱', '🐼', '🦊', '🐨', '🦁', '🐯', '🐻', '🐰', '🐸', '🐵', '🐔', '🐧', '🐦', '🦉', '🐺', '🐗', '🐴', '🦄', '🦋', '🐛', '🐌', '🐞', '🐜', '🐝', '🐢', '🐍', '🐙', '🦑', '🐠', '🐬', '🐳', '🦖', '🐉', '🌵'];
function getEmojiForUserId(userId: number): string {
  if (userId <= 0) return '👤';
  const index = (userId - 1) % userEmojiList.length;
  return userEmojiList[index];
}
// --- ここまで絵文字生成 ---

async function main() {
  console.log(`Start seeding ...`);

  // 既存のデータを削除
  console.log(`Deleting existing follows...`);
  await prisma.follows.deleteMany({});
  console.log(`Deleting existing posts...`);
  await prisma.post.deleteMany({});
  console.log(`Deleting existing users...`);
  await prisma.user.deleteMany({});

  // ユーザーを30人作成
  const usersToCreate = 30;
  const createdUserNames = new Set<string>();
  const createdUsers = []; // 作成したユーザー情報を保持

  console.log(`Creating ${usersToCreate} users...`);
  for (let i = 1; i <= usersToCreate; i++) { // ID 1から開始するように調整
    let name = generateRandomName();
    let attempt = 0;
    while (createdUserNames.has(name) && attempt < 50) {
        name = generateRandomName();
        attempt++;
    }
    if(createdUserNames.has(name)) {
        console.warn(`Skipping user creation due to duplicate name: ${name}`);
        continue;
    }
    createdUserNames.add(name);

    // ★ emoji を決定
    // 注意: Prismaは通常自動インクリメントでIDを振るため、
    // このループのインデックス `i` がそのままDBのIDになるとは限らない。
    // しかし、今回はdeleteMany後に作成するため、ほぼ i = id になる想定。
    // より確実にするなら、create後に再度IDでemojiをupdateする。
    // → シンプルにするため、ここではループインデックスでemojiを決定する。
    const emoji = getEmojiForUserId(i);

    const user = await prisma.user.create({
      data: {
        name,
        emoji: emoji, // ★ emoji を設定
      },
    });
    createdUsers.push(user);
    console.log(`Created user with id: ${user.id}, name: ${user.name}, emoji: ${user.emoji}`);
  }

  // TODO: 必要であれば、ここでフォロー関係や投稿の初期データも作成できる

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
