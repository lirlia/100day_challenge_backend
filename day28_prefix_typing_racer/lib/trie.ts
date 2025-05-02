/**
 * Trie (Prefix Tree) のノードを表すクラス
 */
class TrieNode {
  children: Map<string, TrieNode>;
  isEndOfWord: boolean;

  constructor() {
    this.children = new Map<string, TrieNode>();
    this.isEndOfWord = false;
  }
}

const MIN_WORDS_FOR_PREFIX = 30; // 接頭辞として採用するための最低単語数

/**
 * Trie (Prefix Tree) データ構造を管理するクラス
 */
export class Trie {
  root: TrieNode;

  constructor() {
    this.root = new TrieNode();
  }

  /**
   * 単語を Trie に挿入する
   * @param word 挿入する単語
   */
  insert(word: string): void {
    let currentNode = this.root;
    for (const char of word) {
      if (!currentNode.children.has(char)) {
        currentNode.children.set(char, new TrieNode());
      }
      currentNode = currentNode.children.get(char)!;
    }
    currentNode.isEndOfWord = true;
  }

  /**
   * 単語が Trie 内に存在するか検索する
   * @param word 検索する単語
   * @returns 存在すれば true、しなければ false
   */
  search(word: string): boolean {
    let currentNode = this.root;
    for (const char of word) {
      if (!currentNode.children.has(char)) {
        return false;
      }
      currentNode = currentNode.children.get(char)!;
    }
    return currentNode.isEndOfWord;
  }

  /**
   * 指定された接頭辞で始まる単語が Trie 内に存在するか確認する
   * @param prefix 確認する接頭辞
   * @returns 接頭辞で始まる単語が存在すれば true、しなければ false
   */
  startsWith(prefix: string): boolean {
    let currentNode = this.root;
    for (const char of prefix) {
      if (!currentNode.children.has(char)) {
        return false;
      }
      currentNode = currentNode.children.get(char)!;
    }
    return true; // 接頭辞のパスが存在すればOK
  }

  /**
   * 指定された接頭辞を持つノードを取得するヘルパーメソッド
   * @param prefix 接頭辞
   * @returns 接頭辞に対応するノード。存在しない場合は null
   */
  private findNode(prefix: string): TrieNode | null {
    let currentNode = this.root;
    for (const char of prefix) {
      if (!currentNode.children.has(char)) {
        return null;
      }
      currentNode = currentNode.children.get(char)!;
    }
    return currentNode;
  }

  /**
   * 指定された接頭辞で始まるすべての単語を取得する
   * @param prefix 接頭辞
   * @returns 接頭辞で始まる単語のリスト
   */
  getAllWordsWithPrefix(prefix: string): string[] {
    const startNode = this.findNode(prefix);
    if (!startNode) {
      return [];
    }

    const words: string[] = [];
    const queue: { node: TrieNode; currentWord: string }[] = [
      { node: startNode, currentWord: prefix },
    ];

    while (queue.length > 0) {
      const { node, currentWord } = queue.shift()!;

      if (node.isEndOfWord) {
        words.push(currentWord);
      }

      for (const [char, childNode] of node.children.entries()) {
        queue.push({ node: childNode, currentWord: currentWord + char });
      }
    }

    return words;
  }

  /**
   * 指定された接頭辞で始まる単語の数をカウントする
   * @param prefix 接頭辞
   * @returns 接頭辞で始まる単語の数
   */
  private countWordsWithPrefix(prefix: string): number {
    const startNode = this.findNode(prefix);
    if (!startNode) {
      return 0;
    }

    let count = 0;
    const queue: TrieNode[] = [startNode];

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (node.isEndOfWord) {
        count++;
      }
      for (const childNode of node.children.values()) {
        queue.push(childNode);
      }
    }
    // 注意: この実装だと prefix 自身が単語の場合もカウントしてしまう。
    // もし prefix 自身を除きたい場合は、開始ノードが isEndOfWord かどうかを最初にチェックし、
    // ループ内で queue に追加する際に prefix + char が単語かどうかを見る必要がある。
    // 今回は prefix 自身も有効な単語として扱うため、このままとする。
    return count;
  }

  /**
   * Trie に格納されている単語から、指定された長さ範囲のランダムな「有効な」接頭辞を取得する
   * (効率改善版: Trieを直接辿る)
   * @param minLength 接頭辞の最小長
   * @param maxLength 接頭辞の最大長
   * @param maxAttempts 最大試行回数
   * @returns ランダムな有効な接頭辞。見つからない場合は空文字列
   */
  getRandomPrefix(minLength: number, maxLength: number, maxAttempts = 50): string {
    let attempts = 0;
    while (attempts < maxAttempts) {
      attempts++;
      let currentNode = this.root;
      let currentPrefix = "";
      let depth = 0;
      let candidatePrefix = ""; // 有効な候補を保持する変数

      // Trie をランダムに辿る (最大 maxLength まで)
      while (currentNode.children.size > 0 && depth < maxLength) {
        const possibleChars = Array.from(currentNode.children.keys());
        const randomChar = possibleChars[Math.floor(Math.random() * possibleChars.length)];
        currentPrefix += randomChar;
        currentNode = currentNode.children.get(randomChar)!;
        depth++;

        // minLength <= depth <= maxLength の範囲の接頭辞を候補とする
        if (depth >= minLength) {
            // この接頭辞で始まる単語数をチェック
            const wordCount = this.countWordsWithPrefix(currentPrefix);
            // console.log(`Checking prefix: ${currentPrefix}, count: ${wordCount}`); // デバッグ用
            if (wordCount >= MIN_WORDS_FOR_PREFIX) {
                candidatePrefix = currentPrefix; // 条件を満たす候補が見つかった
                // さらに深く探索するか、ここで確定するかは確率などで決められる
                // ここでは、条件を満たした最初のものを採用するシンプルな実装
                // return candidatePrefix;
                // ↑ すぐに return せず、もう少し深く探索させてみる
            } else {
                 // 単語数が少なすぎる場合は、このパスはあまり良くないかもしれない
                 // (ただし、深い階層で単語が増える可能性もある)
            }
        }
      }

      // ループ終了後、有効な候補が見つかっていればそれを返す
      if (candidatePrefix) {
          return candidatePrefix;
      }

      // ループが maxLength に達するか、子がないノードに行き着き、
      // かつ candidatePrefix が見つからなかった場合。
      // 最後の currentPrefix が条件を満たすか一応チェック
      if (currentPrefix.length >= minLength && currentPrefix.length <= maxLength) {
          const wordCount = this.countWordsWithPrefix(currentPrefix);
          if (wordCount >= MIN_WORDS_FOR_PREFIX) {
              return currentPrefix;
          }
      }

      // 適切な接頭辞が見つからなければリトライ
    }

    console.warn(`Could not find a valid prefix after ${maxAttempts} attempts.`);
    return ""; // 見つからなかった場合
  }

  /**
   * Trie 内のすべての単語を取得する（getRandomPrefixのヘルパー）
   * 注意: 大量の単語が格納されている場合、メモリを消費する可能性がある
   * @returns Trie 内のすべての単語のリスト
   */
  // private getAllWords(): string[] { // このメソッドは非効率なためコメントアウトまたは削除
  //   const words: string[] = [];
  //   const queue: { node: TrieNode; currentWord: string }[] = [
  //       { node: this.root, currentWord: "" },
  //   ];
  //   ...
  //   return words;
  // }
}
