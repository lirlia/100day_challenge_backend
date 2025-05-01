import { PrismaClient } from '../app/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding ...');

  const now = Date.now(); // 現在時刻 (ミリ秒)
  const yesterday = now - 24 * 60 * 60 * 1000; // 24時間前の時刻 (ミリ秒)
  const totalPoints = 1000;
  const keys = ['sensor_A', 'sensor_B'];
  const dataToCreate = [];

  for (const key of keys) {
    for (let i = 0; i < totalPoints; i++) {
      // 過去24時間内でランダムなタイムスタンプ (秒単位) を生成
      const randomTimestampMs = yesterday + Math.random() * (now - yesterday);
      const timestamp = Math.floor(randomTimestampMs / 1000);

      let value: number;
      if (key === 'sensor_A') {
        // sensor_A: 20から30の間のランダムな値
        value = 20 + Math.random() * 10;
      } else { // sensor_B
        // sensor_B: 緩やかなサインカーブ + ノイズ
        // 24時間で1周期とし、振幅を5、中心を50とする
        const period = 24 * 60 * 60 * 1000; // 24時間 (ミリ秒)
        const phase = ((randomTimestampMs - yesterday) / period) * 2 * Math.PI;
        const sineValue = 50 + 5 * Math.sin(phase);
        const noise = (Math.random() - 0.5) * 2; // -1 から 1 のノイズ
        value = sineValue + noise;
      }

      dataToCreate.push({
        key,
        timestamp,
        value: parseFloat(value.toFixed(4)), // 小数点以下4桁に丸める
      });
    }
  }

  // 大量データのため、分割して挿入する方が安全な場合もあるが、今回は createMany を試す
  // SQLite のパラメータ上限に注意 (通常は問題ないはず)
  console.log(`Generating ${dataToCreate.length} data points...`);

  // 既存データを削除 (オプション)
  console.log('Deleting existing data...');
  await prisma.timeSeriesData.deleteMany();

  // 新しいデータを挿入
  console.log('Inserting new data...');
  const result = await prisma.timeSeriesData.createMany({
    data: dataToCreate,
  });

  console.log(`Seeding finished. Inserted ${result.count} records.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
