/**
 * 日本語分析エンジン
 * シンプルな日本語テキスト分割・正規化・フィルタリング
 */

// ストップワード辞書（検索で除外する頻出語）
const STOP_WORDS = new Set([
  // 助詞
  'は', 'が', 'を', 'に', 'で', 'と', 'から', 'まで', 'より', 'へ', 'の', 'も', 'か', 'や', 'だ', 'である',
  // 助動詞・動詞活用
  'です', 'ます', 'した', 'する', 'される', 'ある', 'ない', 'れる', 'られる', 'せる', 'させる',
  // 接続詞・副詞
  'そして', 'また', 'しかし', 'だから', 'なぜなら', 'つまり', 'ただし', 'ところで', 'ちなみに',
  'とても', 'すごく', 'たくさん', '少し', 'もう', 'まだ', 'やはり', 'きっと', 'たぶん',
  // 記号・その他
  'これ', 'それ', 'あれ', 'どれ', 'ここ', 'そこ', 'あそこ', 'どこ', 'こう', 'そう', 'ああ', 'どう',
  'この', 'その', 'あの', 'どの', 'という', 'といった', 'など', 'なども', 'さらに', 'もっと'
]);

// 文字種判定関数群
function isHiragana(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x3041 && code <= 0x3096;
}

function isKatakana(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x30A1 && code <= 0x30F6;
}

function isKanji(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x4E00 && code <= 0x9FAF;
}

function isAlphaNumeric(char: string): boolean {
  return /[a-zA-Z0-9]/.test(char);
}

function isPunctuation(char: string): boolean {
  return /[。、！？：；（）「」『』【】〔〕〈〉《》・…]/.test(char);
}

// 文字種タイプ
enum CharType {
  HIRAGANA = 'hiragana',
  KATAKANA = 'katakana',
  KANJI = 'kanji',
  ALPHANUMERIC = 'alphanumeric',
  PUNCTUATION = 'punctuation',
  OTHER = 'other'
}

function getCharType(char: string): CharType {
  if (isHiragana(char)) return CharType.HIRAGANA;
  if (isKatakana(char)) return CharType.KATAKANA;
  if (isKanji(char)) return CharType.KANJI;
  if (isAlphaNumeric(char)) return CharType.ALPHANUMERIC;
  if (isPunctuation(char)) return CharType.PUNCTUATION;
  return CharType.OTHER;
}

/**
 * シンプルな日本語単語分割器
 * 文字種の境界で分割（ひらがな・カタカナ・漢字・英数字）
 */
export function segmentJapanese(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const words: string[] = [];
  let currentWord = '';
  let currentType: CharType | null = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charType = getCharType(char);

    // 空白文字はスキップ
    if (char.trim() === '') {
      if (currentWord) {
        words.push(currentWord);
        currentWord = '';
        currentType = null;
      }
      continue;
    }

    // 句読点は独立した単語として扱う
    if (charType === CharType.PUNCTUATION) {
      if (currentWord) {
        words.push(currentWord);
        currentWord = '';
      }
      words.push(char);
      currentType = null;
      continue;
    }

    // 文字種が変わった場合は単語を区切る
    if (currentType !== null && currentType !== charType) {
      // ただし、ひらがな→漢字、漢字→ひらがなの場合は連続させることがある
      const shouldContinue =
        (currentType === CharType.HIRAGANA && charType === CharType.KANJI) ||
        (currentType === CharType.KANJI && charType === CharType.HIRAGANA);

      if (!shouldContinue) {
        if (currentWord) {
          words.push(currentWord);
        }
        currentWord = char;
        currentType = charType;
        continue;
      }
    }

    currentWord += char;
    currentType = charType;
  }

  // 最後の単語を追加
  if (currentWord) {
    words.push(currentWord);
  }

  return words.filter(word => word.trim().length > 0);
}

/**
 * テキストの正規化
 * - 全角英数字を半角に変換
 * - カタカナの小文字変換
 * - 不要な記号の削除
 */
export function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let normalized = text;

  // 全角英数字を半角に変換
  normalized = normalized.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
  });

  // カタカナの長音符を正規化
  normalized = normalized.replace(/ー/g, 'ー');

  // 連続する空白を単一に
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized.trim();
}

/**
 * ストップワードのフィルタリング
 */
export function filterStopWords(words: string[]): string[] {
  return words.filter(word => {
    // 長さチェック（1文字以下は除外）
    if (word.length <= 1) return false;

    // ストップワードチェック
    if (STOP_WORDS.has(word)) return false;

    // 数字のみは除外
    if (/^\d+$/.test(word)) return false;

    // 記号のみは除外
    if (/^[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+$/.test(word)) return false;

    return true;
  });
}

/**
 * 単語の重要度スコア計算（簡易版）
 * 文字種や長さによる重み付け
 */
export function calculateWordWeight(word: string): number {
  if (!word || word.length === 0) return 0;

  let weight = 1.0;

  // 長さによる重み付け
  if (word.length >= 3) weight += 0.2;
  if (word.length >= 5) weight += 0.3;

  // 文字種による重み付け
  const hasKanji = /[\u4E00-\u9FAF]/.test(word);
  const hasKatakana = /[\u30A0-\u30FF]/.test(word);
  const hasAlpha = /[a-zA-Z]/.test(word);

  if (hasKanji) weight += 0.4; // 漢字は重要度高
  if (hasKatakana) weight += 0.2; // カタカナは専門用語の可能性
  if (hasAlpha) weight += 0.1; // 英字は技術用語の可能性

  // 特定パターンの重み付け
  if (/[\u4E00-\u9FAF]{2,}/.test(word)) weight += 0.3; // 漢字2文字以上
  if (/[\u30A0-\u30FF]{3,}/.test(word)) weight += 0.2; // カタカナ3文字以上

  return Math.min(weight, 2.0); // 最大重み2.0
}

/**
 * 文書の前処理パイプライン
 * 正規化 → 分割 → ストップワード除去 → 重み付け
 */
export interface ProcessedDocument {
  words: string[];
  wordWeights: Map<string, number>;
  totalWords: number;
  uniqueWords: number;
}

export function preprocessDocument(text: string): ProcessedDocument {
  console.log(`[Japanese Analyzer] Processing document: ${text.substring(0, 100)}...`);

  // 1. テキスト正規化
  const normalized = normalizeText(text);

  // 2. 単語分割
  const segmented = segmentJapanese(normalized);
  console.log(`[Japanese Analyzer] Segmented into ${segmented.length} tokens`);

  // 3. ストップワード除去
  const filtered = filterStopWords(segmented);
  console.log(`[Japanese Analyzer] After filtering: ${filtered.length} words`);

  // 4. 重み計算
  const wordWeights = new Map<string, number>();

  filtered.forEach(word => {
    const weight = calculateWordWeight(word);
    wordWeights.set(word, weight);
  });

  const uniqueWords = wordWeights.size;

  console.log(`[Japanese Analyzer] Unique words: ${uniqueWords}`);

  return {
    words: filtered,
    wordWeights,
    totalWords: filtered.length,
    uniqueWords
  };
}

/**
 * デバッグ用：分析結果の詳細表示
 */
export function debugAnalysis(text: string): void {
  console.log('=== Japanese Analysis Debug ===');
  console.log('Original:', text.substring(0, 200));

  const normalized = normalizeText(text);
  console.log('Normalized:', normalized.substring(0, 200));

  const segmented = segmentJapanese(normalized);
  console.log('Segmented (first 20):', segmented.slice(0, 20));

  const filtered = filterStopWords(segmented);
  console.log('Filtered (first 20):', filtered.slice(0, 20));

  const processed = preprocessDocument(text);
  console.log('Weights (top 10):',
    Array.from(processed.wordWeights.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
  );
  console.log('================================');
}
