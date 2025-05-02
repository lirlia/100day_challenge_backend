import { NextRequest, NextResponse } from 'next/server';
import { getTrie } from '../../../../lib/dictionary';

// 接頭辞の長さの範囲（start と同じ値を使用）
const MIN_PREFIX_LENGTH = 2;
const MAX_PREFIX_LENGTH = 4;

// 正解時のスコア計算（例：単語の長さ * 10）
function calculateScore(word: string): number {
  return word.length * 10;
}

export async function POST(request: NextRequest) {
  try {
    const trie = await getTrie();
    const body = await request.json();
    const { currentPrefix, typedWord } = body;

    // 入力値の簡単なバリデーション
    if (
      !currentPrefix ||
      typeof currentPrefix !== 'string' ||
      !typedWord ||
      typeof typedWord !== 'string'
    ) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    let isValid = false;
    let scoreIncrement = 0;
    let reason: 'wrong_prefix' | 'not_a_word' | undefined = undefined;

    // 1. 接頭辞が一致するか？
    if (!typedWord.startsWith(currentPrefix)) {
      reason = 'wrong_prefix';
    } else {
      // 2. 単語が辞書に存在するか？
      if (trie.search(typedWord)) {
        isValid = true;
        scoreIncrement = calculateScore(typedWord);
      } else {
        reason = 'not_a_word';
      }
    }

    // 次の接頭辞を取得
    const nextPrefix = trie.getRandomPrefix(MIN_PREFIX_LENGTH, MAX_PREFIX_LENGTH);
    if (!nextPrefix) {
      // これは本来発生しづらいが、念のためエラーハンドリング
      console.error('Failed to get next prefix.');
      return NextResponse.json({ error: 'Failed to get next question.' }, { status: 500 });
    }

    console.log(
      `Submit: prefix=${currentPrefix}, word=${typedWord}, valid=${isValid}, score=${scoreIncrement}, next=${nextPrefix}`
    );

    // 結果を返す
    return NextResponse.json({
      isValid,
      scoreIncrement,
      nextPrefix,
      ...(reason && { reason }), // reason が存在する場合のみ含める
    });

  } catch (error) {
    if (error instanceof SyntaxError) { // JSON パースエラーの場合
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('Error submitting word:', error);
    return NextResponse.json(
      { error: 'Internal server error while submitting word.' },
      { status: 500 }
    );
  }
}
