import { PrismaClient } from '../app/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // サンプルジョブを作成
  const now = new Date();

  // 定期実行ジョブのサンプル
  await prisma.job.create({
    data: {
      name: 'ログファイル圧縮',
      description: '毎日のログファイルを圧縮して保管',
      command: 'gzip -r /var/log/*.log',
      scheduleType: 'interval',
      interval: 1,
      intervalUnit: 'hour',
      isActive: true,
      nextRunAt: new Date(now.getTime() + 60 * 60 * 1000), // 1時間後
    },
  });

  // 一回実行のジョブサンプル
  await prisma.job.create({
    data: {
      name: 'DB バックアップ',
      description: 'データベースの完全バックアップ',
      command: 'pg_dump -U postgres > backup.sql',
      scheduleType: 'once',
      scheduledAt: new Date(now.getTime() + 30 * 60 * 1000), // 30分後
      isActive: true,
      nextRunAt: new Date(now.getTime() + 30 * 60 * 1000),
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
