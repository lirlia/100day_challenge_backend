import { PrismaClient } from '../app/generated/prisma';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

// ES Modules で __dirname を取得する代替方法
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// 単語リストファイルのパス
const wordListPath = path.join(__dirname, 'words_alpha.txt');
// 一度にDBに挿入する単語数 (メモリ使用量を抑えるため)
const BATCH_SIZE = 1000;

async function main() {
  console.log(`Start seeding from ${wordListPath}...`);

  const fileStream = fs.createReadStream(wordListPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let wordsBatch: { text: string }[] = [];
  let totalWords = 0;
  let insertedWords = 0;

  for await (const line of rl) {
    const word = line.trim();
    // 簡単なバリデーション（空行や短すぎる単語を除外）
    if (word && word.length >= 2) {
      wordsBatch.push({ text: word });
      totalWords++;

      if (wordsBatch.length >= BATCH_SIZE) {
        await prisma.word.createMany({
          data: wordsBatch,
          // skipDuplicates: true, // SQLiteではサポートされていないため削除
        });
        insertedWords += wordsBatch.length;
        console.log(`Inserted ${insertedWords} / ${totalWords} words...`);
        wordsBatch = []; // バッチをリセット
      }
    }
  }

  // 最後のバッチに残っている単語を挿入
  if (wordsBatch.length > 0) {
    await prisma.word.createMany({
      data: wordsBatch,
      // skipDuplicates: true,
    });
    insertedWords += wordsBatch.length;
  }

  console.log(`Seeding finished. Total words processed: ${totalWords}. Words inserted into DB: ${insertedWords}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
