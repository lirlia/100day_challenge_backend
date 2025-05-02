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

      // Trie をランダムに辿る (最大 maxLength まで)
      while (currentNode.children.size > 0 && depth < maxLength) {
        const possibleChars = Array.from(currentNode.children.keys());
        const randomChar = possibleChars[Math.floor(Math.random() * possibleChars.length)];
        currentPrefix += randomChar;
        currentNode = currentNode.children.get(randomChar)!;
        depth++;

        // minLength <= depth <= maxLength の範囲で、かつ子ノードが存在する or 単語の終端なら候補とする
        if (depth >= minLength && (currentNode.children.size > 0 || currentNode.isEndOfWord)) {
           // 一定確率でこの深さの接頭辞を採用する（深い方を優先させたい場合など調整可能）
           // ここでは単純に条件を満たしたら採用
           return currentPrefix;
        }
      }
      // ループが maxLength に達するか、子がないノードに行き着いた場合
      // もし currentPrefix が minLength を満たしていればそれを使う
      if (currentPrefix.length >= minLength && currentPrefix.length <= maxLength) {
          // ただし、この接頭辞で終わる単語が存在するかを確認した方がより「有効」
          // (今回は簡易的に長さだけでチェック)
          return currentPrefix;
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
