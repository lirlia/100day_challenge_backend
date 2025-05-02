import { PrismaClient } from '../app/generated/prisma';
import { Trie } from './trie';

const prisma = new PrismaClient();

/**
 * アプリケーション全体で共有される Trie インスタンス（シングルトン）
 */
let trieInstance: Trie | null = null;

/**
 * Trie インスタンスを初期化し、データベースから単語をロードする関数
 * すでに初期化されている場合は何もしない
 */
async function initializeTrie(): Promise<void> {
  if (trieInstance) {
    console.log('Trie already initialized.');
    return;
  }

  console.log('Initializing Trie...');
  const newTrie = new Trie();

  try {
    // DBから全単語を取得（メモリに注意が必要な場合、ストリームやページングを検討）
    const words = await prisma.word.findMany({
      select: { text: true },
    });

    if (!words || words.length === 0) {
        console.warn('No words found in the database. Trie will be empty.');
    } else {
        console.log(`Loading ${words.length} words into Trie...`);
        for (const word of words) {
          newTrie.insert(word.text);
        }
        console.log('Trie loaded successfully.');
    }
    trieInstance = newTrie;

  } catch (error) {
    console.error('Failed to initialize Trie:', error);
    // 初期化に失敗した場合でも、空のTrieインスタンスを設定しておくことも考えられる
    // trieInstance = new Trie();
    throw new Error('Trie initialization failed'); // エラーを再スロー
  } finally {
    // Prisma Client の接続はアプリケーション全体で管理されるため、
    // ここで $disconnect する必要はない（通常はアプリ終了時）
  }
}

/**
 * 初期化済みの Trie インスタンスを取得する関数
 * まだ初期化されていない場合は初期化を試みる
 * @returns 初期化済みの Trie インスタンス
 * @throws Trie の初期化に失敗した場合
 */
export async function getTrie(): Promise<Trie> {
  if (!trieInstance) {
    await initializeTrie();
  }
  // initializeTrie内でエラー時に throw するので、null チェックは不要と見なせる
  // ただし、より安全にするなら再度チェックやエラー処理を追加
  if (!trieInstance) {
      throw new Error('Trie instance is not available after initialization attempt.');
  }
  return trieInstance;
}

// オプション: アプリケーション起動時に即時初期化を試みる場合
// initializeTrie().catch(error => {
//   console.error("Initial Trie load failed on startup:", error);
//   // ここでアプリケーションを終了させるか、警告に留めるかなどを決定
// });
