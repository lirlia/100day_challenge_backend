import { NextResponse } from 'next/server';
import { getTrie } from '../../../../lib/dictionary';

// 接頭辞の長さの範囲
const MIN_PREFIX_LENGTH = 2;
const MAX_PREFIX_LENGTH = 4;

export async function GET() {
  try {
    const trie = await getTrie(); // Trieインスタンスを取得（初回なら初期化）

    // ランダムな接頭辞を取得
    const prefix = trie.getRandomPrefix(MIN_PREFIX_LENGTH, MAX_PREFIX_LENGTH);

    if (!prefix) {
      console.error('Failed to get a random prefix from Trie.');
      return NextResponse.json(
        { error: 'Failed to start game. Dictionary might be empty or too small.' },
        { status: 500 }
      );
    }

    console.log(`Game started with prefix: ${prefix}`);
    return NextResponse.json({ prefix });

  } catch (error) {
    console.error('Error starting game:', error);
    return NextResponse.json(
      { error: 'Internal server error while starting game.' },
      { status: 500 }
    );
  }
}
